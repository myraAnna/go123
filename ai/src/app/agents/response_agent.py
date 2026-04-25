import json
import logging
from datetime import date, datetime
from datetime import UTC
from inspect import signature
from pathlib import Path
from urllib import error as urllib_error
from urllib import request as urllib_request
from enum import Enum
from typing import Annotated, Any, List, Literal, Optional, TypedDict
from uuid import uuid4
from zoneinfo import ZoneInfo

from dotenv import dotenv_values
from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_core.tools import tool
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.types import Send, interrupt
from pydantic import BaseModel, Field, ValidationError, model_validator

from src.app.deps import get_config
from src.app.utils.bedrock_client import BedrockClientError, ChatBedrockClient


logger = logging.getLogger(__name__)


class ResponseToolArgs(BaseModel):
    response: str = Field(..., description="The final response string for the user.")


class OrderAnalyticsToolArgs(BaseModel):
    pass


@tool(args_schema=ResponseToolArgs)
def response(response: str) -> str:
    """Send the final response back to the user."""
    return response


@tool(args_schema=OrderAnalyticsToolArgs)
def order_analytics() -> str:
    """Fetch merchant order information."""
    return ""


class ResponseDecision(BaseModel):
    response: str = Field(
        ...,
        description="The answer to the user that must be passed into the response tool.",
    )


class AgentDecision(BaseModel):
    tool_name: Literal["order_analytics", "response"] | None = Field(
        default=None,
        alias="toolName",
    )
    response: str | None = None

    @model_validator(mode="after")
    def validate_decision(self) -> "AgentDecision":
        if self.tool_name is None:
            if self.response:
                self.tool_name = response.name
            else:
                self.tool_name = order_analytics.name

        if self.tool_name == response.name and not self.response:
            raise ValueError("response is required when toolName=response")
        if self.tool_name is None:
            raise ValueError(
                "AgentDecision must include either order_analytics or response"
            )
        return self


class ResponseAgentDefinition:
    tool_names = [order_analytics.name, response.name]
    base_system_prompt = (
        "You are a helpful assistant. Your job is to answer the user's question. "
        "You have exactly two tools: order_analytics and response. "
        "Use order_analytics when you need the merchant's order data. "
        "The order_analytics tool takes no arguments and returns the merchant's raw order information. "
        "Use response for direct answers and always after reading order_analytics tool results. "
        "The conversation must always end with the response tool. "
        "After receiving order_analytics tool output, summarize it in plain language and never return raw JSON in the response tool. "
        "Keep answers direct and useful."
    )


class GraphState(TypedDict, total=False):
    messages: Annotated[List[BaseMessage], add_messages]
    merchant_id: str
    agent_type: str
    current_task_id: str
    deferred_tool_calls: list[dict[str, Any]] | None
    last_user_checkpoint_id: str | None
    last_user_task_id: str | None
    last_user_message_id: str | None
    final_response_sent: bool


class NodeName(str, Enum):
    AGENT = "agent"
    GATEKEEPER = "gatekeeper"
    AGGREGATOR = "aggregator"
    RESCHEDULE = "reschedule_deferred_tools"
    DEFER = "defer_tools_node"
    ORDER_ANALYTICS = "order_analytics_node"
    RESPONSE_NODE = "response_node"
    MARK_COMPLETE = "mark_task_complete_node"
    CORRECTION = "tool_call_correction_node"
    END_NODE = "end_node"
    REMINDER = "reminder_node"


ALL_TOOLS = {
    order_analytics.name: order_analytics,
    response.name: response,
}

TOOL_ROUTING_MAP = {
    order_analytics.name: NodeName.ORDER_ANALYTICS,
    response.name: NodeName.RESPONSE_NODE,
}


def wrap_node_with_logging(func, node_name: str):
    params = signature(func).parameters

    if "config" in params:

        async def _wrapped(state, config):
            logger.info("---%s---", node_name.upper())
            return await func(state, config)

        return _wrapped

    async def _wrapped(state):
        logger.info("---%s---", node_name.upper())
        return await func(state)

    return _wrapped


def _build_bedrock_messages(state: GraphState) -> list[BaseMessage]:
    now_utc = datetime.now(UTC)
    now_myt = now_utc.astimezone(ZoneInfo("Asia/Kuala_Lumpur"))
    system_prompt = (
        f"{ResponseAgentDefinition.base_system_prompt} "
        f"Current UTC time: {now_utc.isoformat()}. "
        f"Current Asia/Kuala_Lumpur time: {now_myt.isoformat()}."
    )
    return [SystemMessage(content=system_prompt)] + _conversation_messages_for_bedrock(
        state
    )


def _json_safe(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [_json_safe(item) for item in value]
    return value


def _sanitize_message_for_bedrock(message: BaseMessage) -> BaseMessage:
    if isinstance(message, AIMessage):
        return AIMessage(
            content=_json_safe(message.content),
            tool_calls=_json_safe(getattr(message, "tool_calls", [])),
            additional_kwargs=_json_safe(message.additional_kwargs),
            response_metadata=_json_safe(getattr(message, "response_metadata", {})),
            id=getattr(message, "id", None),
            name=getattr(message, "name", None),
        )

    if isinstance(message, ToolMessage):
        return ToolMessage(
            content=_json_safe(message.content),
            tool_call_id=message.tool_call_id,
            name=getattr(message, "name", None),
            additional_kwargs=_json_safe(message.additional_kwargs),
            id=getattr(message, "id", None),
        )

    if isinstance(message, HumanMessage):
        return HumanMessage(
            content=_json_safe(message.content),
            additional_kwargs=_json_safe(message.additional_kwargs),
            id=getattr(message, "id", None),
            name=getattr(message, "name", None),
        )

    if isinstance(message, SystemMessage):
        return SystemMessage(
            content=_json_safe(message.content),
            additional_kwargs=_json_safe(message.additional_kwargs),
            id=getattr(message, "id", None),
            name=getattr(message, "name", None),
        )

    return message


def _stringify_message_content(content: Any) -> str:
    safe_content = _json_safe(content)
    if isinstance(safe_content, str):
        return safe_content
    if isinstance(safe_content, list):
        return "\n".join(str(item) for item in safe_content)
    if isinstance(safe_content, dict):
        return json.dumps(safe_content, ensure_ascii=True)
    return str(safe_content)


def _conversation_messages_for_bedrock(state: GraphState) -> list[BaseMessage]:
    prompt_messages: list[BaseMessage] = []
    for message in state.get("messages", []):
        if isinstance(message, HumanMessage):
            prompt_messages.append(
                HumanMessage(content=_stringify_message_content(message.content))
            )
            continue

        if isinstance(message, AIMessage):
            if getattr(message, "tool_calls", None):
                continue
            text = _stringify_message_content(message.content).strip()
            if text:
                prompt_messages.append(AIMessage(content=text))
            continue

        if isinstance(message, ToolMessage):
            continue

        if isinstance(message, SystemMessage):
            prompt_messages.append(
                SystemMessage(content=_stringify_message_content(message.content))
            )

    return prompt_messages


def _latest_tool_result_is_order_analytics(state: GraphState) -> bool:
    last_message = state["messages"][-1]
    return (
        isinstance(last_message, ToolMessage)
        and getattr(last_message, "name", None) == order_analytics.name
    )


def _latest_order_analytics_tool_content(state: GraphState) -> str | None:
    last_message = state["messages"][-1]
    if not (
        isinstance(last_message, ToolMessage)
        and getattr(last_message, "name", None) == order_analytics.name
    ):
        return None
    content = last_message.content
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(str(item) for item in content)
    return str(content)


def _build_response_tool_call(response_text: str, call_id: str) -> AIMessage:
    return AIMessage(
        content="",
        tool_calls=[
            {
                "id": call_id,
                "name": response.name,
                "args": {"response": response_text},
            }
        ],
    )


def _build_post_analytics_bedrock_messages(state: GraphState) -> list[BaseMessage]:
    messages = _build_bedrock_messages(state)
    tool_content = _latest_order_analytics_tool_content(state)
    if tool_content:
        messages.append(
            HumanMessage(
                content=(
                    "Here is the latest order analytics result in JSON. Use it to answer the user:\n"
                    f"{tool_content}"
                )
            )
        )
    messages.append(
        SystemMessage(
            content=(
                "You have already received the order_analytics tool result. "
                "Your only job now is to summarize that order data in plain language for the merchant. "
                "Do not repeat raw JSON. Do not output JSON. Do not mention tools. "
                "Return a concise natural-language answer only."
            )
        )
    )
    return messages


def _summarize_analytics_json(raw_content: str) -> str | None:
    try:
        payload = json.loads(raw_content)
    except Exception:
        return None

    if not isinstance(payload, dict):
        return None

    if "orders" in payload and isinstance(payload["orders"], list):
        orders = payload["orders"]
        paid_orders = [order for order in orders if order.get("paidAt")]
        revenue_cents = sum(int(order.get("totalCents") or 0) for order in paid_orders)
        buyer_count = len(
            {
                order.get("buyerEmail")
                for order in paid_orders
                if order.get("buyerEmail")
            }
        )
        if not paid_orders:
            return "I found no paid orders for this merchant."
        return (
            f"I found {len(paid_orders)} paid orders with total revenue of RM {revenue_cents / 100:.2f} "
            f"from {buyer_count} distinct buyers."
        )

    if "meta" not in payload:
        return None

    meta = payload.get("meta", {}) or {}
    summary = payload.get("summary", {}) or {}
    rows = payload.get("rows", []) or []
    matched_orders = meta.get("matchedOrders")
    if matched_orders == 0:
        return "I found no paid orders in the requested time range."

    parts: list[str] = []
    revenue_cents = summary.get("revenueCents")
    order_count = summary.get("orderCount")
    distinct_buyers = summary.get("distinctBuyers")

    if revenue_cents is not None:
        parts.append(f"Revenue was RM {revenue_cents / 100:.2f}")
    if order_count is not None:
        parts.append(f"from {order_count} orders")
    if distinct_buyers is not None:
        parts.append(f"with {distinct_buyers} distinct buyers")

    answer = " ".join(parts).strip()
    if answer:
        answer += "."

    if rows:
        top_row = rows[0]
        labels = []
        for key, value in top_row.items():
            if key in {
                "revenueCents",
                "orderCount",
                "avgOrderValueCents",
                "itemQty",
                "itemRevenueCents",
                "ordersContainingItem",
                "avgItemsPerOrder",
                "distinctBuyers",
                "repeatBuyerCount",
                "repeatBuyerRate",
            }:
                continue
            labels.append(f"{key}={value}")
        if labels:
            prefix = "Top result"
            metric_bits = []
            for metric_key in ["revenueCents", "orderCount", "itemQty", "itemRevenueCents"]:
                if metric_key in top_row and top_row[metric_key] is not None:
                    metric_bits.append(f"{metric_key}={top_row[metric_key]}")
            details = ", ".join(labels + metric_bits)
            answer = (answer + " " if answer else "") + f"{prefix}: {details}."

    return answer or "I analyzed the orders and prepared the result."


def _finalize_post_analytics_response(state: GraphState, response_text: str) -> str:
    stripped = response_text.strip()
    if stripped.startswith("{") or stripped.startswith("["):
        tool_content = _latest_order_analytics_tool_content(state)
        if tool_content:
            fallback = _summarize_analytics_json(tool_content)
            if fallback:
                logger.info("Using deterministic analytics summary fallback for final response")
                return fallback
    return response_text


def _build_order_analytics_tool_call(call_id: str) -> AIMessage:
    return AIMessage(
        content="",
        tool_calls=[
            {
                "id": call_id,
                "name": order_analytics.name,
                "args": {},
            }
        ],
    )


def _orders_url() -> str:
    config = get_config()
    env_values: dict[str, str] = {}
    for parent in Path(__file__).resolve().parents:
        env_path = parent / ".env"
        if env_path.exists():
            env_values = {
                key: value
                for key, value in dotenv_values(env_path).items()
                if value is not None
            }
            break

    backend_ip = env_values.get("BACKEND_IP") or config.backend_ip
    backend_port = int(env_values.get("BACKEND_PORT") or config.backend_port)
    return f"http://{backend_ip}:{backend_port}/v1/orders"


def _fetch_orders_payload(merchant_id: str) -> dict[str, Any]:
    request = urllib_request.Request(
        _orders_url(),
        headers={"X-Merchant-Id": merchant_id},
        method="GET",
    )
    with urllib_request.urlopen(request, timeout=15) as response_handle:
        payload = json.loads(response_handle.read().decode("utf-8"))
    logger.info(
        "order_analytics raw_orders_payload merchant_id=%s payload=%s",
        merchant_id,
        json.dumps(payload, ensure_ascii=True),
    )
    return payload


def _read_http_error_body(exc: urllib_error.HTTPError) -> str:
    try:
        body = exc.read().decode("utf-8", errors="replace").strip()
    except Exception:
        return ""
    return body


def call_interrupt(state: GraphState, interrupt_data: str) -> dict[str, list[BaseMessage]]:
    interrupt_result = interrupt(interrupt_data)

    if isinstance(interrupt_result, dict) and "messages" in interrupt_result:
        return interrupt_result

    if isinstance(interrupt_result, BaseMessage):
        return {"messages": [interrupt_result]}

    return {
        "messages": [
            AIMessage(
                content=str(interrupt_result),
                additional_kwargs={
                    "current_task_id": state.get("current_task_id"),
                    "is_reminder": False,
                },
            )
        ]
    }


async def response_node(state: GraphState):
    last_message = state["messages"][-1]
    tool_call = (
        last_message.tool_calls[0]
        if isinstance(last_message, AIMessage) and last_message.tool_calls
        else None
    )
    if not tool_call:
        return {}

    interrupt_data = str(tool_call.get("args", {}).get("response", "")).strip()
    interrupt_response = call_interrupt(state, interrupt_data)

    tool_call_id = tool_call.get("id", "response-tool-call")
    name = tool_call.get("name", response.name)
    tool_message = ToolMessage(
        content=[interrupt_data],
        tool_call_id=tool_call_id,
        name=name,
        additional_kwargs={"current_task_id": state.get("current_task_id")},
    )
    result = {
        "final_response_sent": True,
        "messages": [tool_message, interrupt_response["messages"][0]],
    }
    return result


async def order_analytics_node(state: GraphState):
    last_message = state["messages"][-1]
    tool_call = (
        last_message.tool_calls[0]
        if isinstance(last_message, AIMessage) and last_message.tool_calls
        else None
    )
    if not tool_call:
        return {}

    tool_call_id = tool_call.get("id", "order-analytics-tool-call")
    merchant_id = str(state.get("merchant_id", "")).strip()
    if not merchant_id:
        return {
            "messages": [
                ToolMessage(
                    content="order_analytics failed: missing merchant_id in graph state.",
                    tool_call_id=tool_call_id,
                    name=order_analytics.name,
                    additional_kwargs={"current_task_id": state.get("current_task_id")},
                )
            ]
        }

    try:
        logger.info(
            "order_analytics fetch merchant_id=%s url=%s",
            merchant_id,
            _orders_url(),
        )
        payload = _fetch_orders_payload(merchant_id)
        logger.info(
            "order_analytics fetched_orders merchant_id=%s order_count=%s",
            merchant_id,
            len(payload.get("orders", [])),
        )
        content = json.dumps(payload, ensure_ascii=True)
    except urllib_error.HTTPError as exc:
        error_body = _read_http_error_body(exc)
        logger.exception(
            "order_analytics backend http error merchant_id=%s url=%s status=%s body=%s",
            merchant_id,
            _orders_url(),
            exc.code,
            error_body,
        )
        content = (
            f"order_analytics failed: backend returned HTTP {exc.code}."
            + (f" Details: {error_body}" if error_body else "")
        )
    except urllib_error.URLError as exc:
        logger.exception(
            "order_analytics backend connection error merchant_id=%s url=%s",
            merchant_id,
            _orders_url(),
        )
        content = f"order_analytics failed: could not reach backend. Details: {exc.reason}"
    except Exception as exc:
        logger.exception("order_analytics unexpected failure merchant_id=%s", merchant_id)
        content = f"order_analytics failed: {exc}"

    return {
        "messages": [
            ToolMessage(
                content=content,
                tool_call_id=tool_call_id,
                name=order_analytics.name,
                additional_kwargs={"current_task_id": state.get("current_task_id")},
            )
        ]
    }


async def reminder_node(state: GraphState):
    """Reminds the agent to make a tool call."""
    return {
        "messages": [
            HumanMessage(
                content="Your response did not contain a tool call. Please select a tool to proceed.",
                additional_kwargs={"is_reminder": True},
            )
        ]
    }


async def aggregator_node(state: GraphState, config):
    """A simple node to act as a synchronization point."""
    logger.info("---AGGREGATOR---")
    last_message = state["messages"][-1]
    checkpoint_map = config.get("configurable", {}).get("checkpoint_map", {})
    checkpoint_id = checkpoint_map.get("")
    if last_message.type == "human":
        last_message.additional_kwargs["checkpoint_id"] = checkpoint_id
        last_message.additional_kwargs["is_reminder"] = False

        updates = {"messages": last_message}
        if checkpoint_id:
            updates["last_user_checkpoint_id"] = checkpoint_id
            updates["last_user_task_id"] = last_message.additional_kwargs.get(
                "current_task_id"
            )
            updates["last_user_message_id"] = getattr(last_message, "id", None)

        return updates

    return {}


async def reschedule_deferred_tools_node(state: GraphState):
    """Re-injects deferred tool calls into the graph for execution."""
    logger.info("---RESCHEDULING DEFERRED TOOLS---")
    deferred_calls = state.get("deferred_tool_calls")
    if not deferred_calls:
        return {}

    ai_message = AIMessage(content="", tool_calls=deferred_calls)
    return {
        "deferred_tool_calls": None,
        "messages": [ai_message],
    }


def post_aggregator_router(state: GraphState):
    """Checks for deferred tool calls after aggregation and routes accordingly."""
    logger.info("---POST AGGREGATOR ROUTER---")
    # if state.get("final_response_sent"):
    #     logger.info("Final response sent, ending graph.")
    #     return END
    if state.get("deferred_tool_calls"):
        logger.info("Deferred tool calls found, rescheduling.")
        return NodeName.RESCHEDULE.value

    logger.info("No deferred tool calls, returning to agent.")
    return NodeName.AGENT.value


async def defer_tools_node(state: GraphState):
    """A dedicated node to add deferred tool calls to the main graph state."""
    logger.info("---DEFERRING TOOLS---")
    return {"deferred_tool_calls": state.get("deferred_tool_calls")}


async def tool_call_correction_node(state: GraphState):
    """Handles cases where the LLM hallucinates a tool name."""
    tool_names = ResponseAgentDefinition.tool_names

    last_message = state["messages"][-1]
    tool_call_id = (
        last_message.tool_calls[0]["id"]
        if isinstance(last_message, AIMessage) and last_message.tool_calls
        else "unknown"
    )

    return {
        "messages": [
            ToolMessage(
                content=(
                    "Your last tool call was invalid. Please use one of the available "
                    f"tools: {', '.join(tool_names)}"
                ),
                tool_call_id=tool_call_id,
            )
        ]
    }


async def agent_node(state: GraphState):
    client = ChatBedrockClient()
    current_task_id = state.get("current_task_id") or str(uuid4())
    updates: GraphState = {"current_task_id": current_task_id}

    try:
        if _latest_tool_result_is_order_analytics(state):
            decision = client.invoke_structured(
                _build_post_analytics_bedrock_messages(state),
                ResponseDecision,
                # max_tokens=800,
                temperature=0.1,
            )
            final_response = _build_response_tool_call(
                _finalize_post_analytics_response(state, decision.response),
                current_task_id,
            )
        else:
            decision = client.invoke_structured(
                _build_bedrock_messages(state),
                AgentDecision,
                # max_tokens=800,
                temperature=0.1,
            )
            if decision.tool_name == order_analytics.name:
                final_response = _build_order_analytics_tool_call(current_task_id)
            else:
                final_response = _build_response_tool_call(
                    decision.response or "",
                    current_task_id,
                )
    except ValidationError as exc:
        logger.exception("Agent generated invalid structured output")
        final_response = _build_response_tool_call(
            (
                "I could not prepare a valid response plan from the model output. "
                f"Details: {exc}"
            ),
            current_task_id,
        )
    except BedrockClientError as exc:
        logger.exception("Agent failed to get Bedrock response")
        fallback = (
            "I ran into an internal error while preparing the response. "
            f"Details: {exc}"
        )
        final_response = _build_response_tool_call(
            fallback,
            current_task_id,
        )

    if final_response:
        final_response.additional_kwargs["current_task_id"] = current_task_id
        updates["messages"] = [final_response]
    else:
        updates["messages"] = []

    return updates


def _validate_tool_schema(
    tool_name: str, args: dict, agent_class: Any, state: GraphState
) -> Optional[str]:
    """Validates tool arguments against its Pydantic schema."""
    tool_instance = ALL_TOOLS.get(tool_name)
    if not tool_instance or not tool_instance.args_schema:
        return None

    try:
        tool_instance.args_schema.model_validate(args)
        return None
    except ValidationError as e:
        error_details = "\n".join(
            [f"- {err['loc'][0]}: {err['msg']}" for err in e.errors()]
        )
        return f"Validation failed for tool '{tool_name}':\n{error_details}"


async def gatekeeper_node(state: GraphState):
    """
    Validates all tool calls in the latest AIMessage.
    Enforces existence, task-specific authorization, and schema validation.
    """
    logger.info("---GATEKEEPER NODE---")
    last_message = state["messages"][-1]
    if not isinstance(last_message, AIMessage) or not last_message.tool_calls:
        return {}

    agent_class = ResponseAgentDefinition
    validation_results: dict[str, dict[str, str]] = {}

    for call in last_message.tool_calls:
        tool_name = call["name"]
        tool_id = call["id"]

        if tool_name not in ALL_TOOLS:
            validation_results[tool_id] = {
                "status": "error",
                "message": f"Tool '{tool_name}' does not exist.",
            }
            continue

        if tool_name not in agent_class.tool_names:
            validation_results[tool_id] = {
                "status": "error",
                "message": f"Tool '{tool_name}' is not allowed for this agent.",
            }
            continue

        schema_error = _validate_tool_schema(
            tool_name,
            call.get("args", {}),
            agent_class,
            state,
        )
        if schema_error:
            validation_results[tool_id] = {
                "status": "error",
                "message": schema_error,
            }
            continue

        validation_results[tool_id] = {
            "status": "ok",
            "message": "ok",
        }

    any_failed = any(result["status"] == "error" for result in validation_results.values())
    if any_failed:
        messages = []
        for call in last_message.tool_calls:
            result = validation_results[call["id"]]
            if result["status"] == "error":
                content = result["message"]
            else:
                content = (
                    f"Execution of '{call['name']}' cancelled. This tool call was valid, "
                    "but another tool in this batch failed validation."
                )
            messages.append(ToolMessage(content=content, tool_call_id=call["id"]))

        return {"messages": messages}

    return {}


def router(state: GraphState):
    logger.info("---ROUTER---")
    last_message = state["messages"][-1]
    if not isinstance(last_message, AIMessage):
        logger.info("Router: last_message is not AIMessage, ending.")
        return END
    if not last_message.tool_calls:
        logger.info("Router: no tool calls found, sending to reminder.")
        return NodeName.REMINDER.value

    immediate_tasks = []
    deferred_tasks = []

    for tool_call in last_message.tool_calls:
        destination_node = TOOL_ROUTING_MAP.get(tool_call["name"])
        logger.info(
            "Router: Tool '%s' routing to '%s'",
            tool_call["name"],
            destination_node,
        )

        payload = state.copy()
        payload["messages"] = [AIMessage(content="", tool_calls=[tool_call])]

        if destination_node in DELAYED_NODES:
            deferred_tasks.append(Send(destination_node.value, payload))
        elif destination_node:
            immediate_tasks.append(Send(destination_node.value, payload))
        else:
            immediate_tasks.append(Send(NodeName.CORRECTION.value, payload))

    if immediate_tasks and deferred_tasks:
        deferred_payload = {
            "deferred_tool_calls": [
                send.arg["messages"][0].tool_calls[0] for send in deferred_tasks
            ]
        }
        return [Send(NodeName.DEFER.value, deferred_payload)] + immediate_tasks

    if immediate_tasks:
        return immediate_tasks

    if deferred_tasks:
        return deferred_tasks

    logger.info("Router: Fallback to reminder.")
    return NodeName.REMINDER.value


def gatekeeper_router(state: GraphState):
    """
    Decides whether to proceed to tool execution or loop back for correction.
    Checks if the last message in history is a ToolMessage.
    """
    last_message = state["messages"][-1]
    if last_message.type == "tool":
        logger.info("Gatekeeper detected validation failure, looping back to agent.")
        return NodeName.AGENT.value

    logger.info("Gatekeeper validation passed, proceeding to tool router.")
    return router(state)


async def end_node(state: GraphState):
    return {}


NODE_CONFIG = {
    NodeName.AGENT: {"func": agent_node},
    NodeName.GATEKEEPER: {"func": gatekeeper_node},
    NodeName.AGGREGATOR: {"func": aggregator_node},
    NodeName.RESCHEDULE: {"func": reschedule_deferred_tools_node},
    NodeName.DEFER: {"func": defer_tools_node},
    NodeName.ORDER_ANALYTICS: {"func": order_analytics_node},
    NodeName.RESPONSE_NODE: {"func": response_node, "is_delayed":True},
    NodeName.END_NODE: {"func": end_node, "is_delayed": True},
    NodeName.CORRECTION: {"func": tool_call_correction_node},
    NodeName.REMINDER: {"func": reminder_node},
}

DELAYED_NODES = {
    name for name, config in NODE_CONFIG.items() if config.get("is_delayed")
}


def create_workflow(tool_names: List[str]):
    """Creates the StateGraph definition."""
    logger.info("Agent initialized with the following tools: %s", tool_names)

    workflow = StateGraph(GraphState)

    for node_name, config in NODE_CONFIG.items():
        wrapped_func = wrap_node_with_logging(config["func"], node_name.value)
        workflow.add_node(node_name.value, wrapped_func)

    workflow.set_entry_point(NodeName.AGENT.value)

    workflow.add_conditional_edges(
        NodeName.AGENT.value,
        lambda state: (
            NodeName.GATEKEEPER.value
            if getattr(state["messages"][-1], "tool_calls", None)
            else router(state)
        ),
        {
            NodeName.GATEKEEPER.value: NodeName.GATEKEEPER.value,
            NodeName.REMINDER.value: NodeName.REMINDER.value,
            END: END,
        },
    )

    workflow.add_conditional_edges(
        NodeName.GATEKEEPER.value,
        gatekeeper_router,
        {
            NodeName.AGENT.value: NodeName.AGENT.value,
            NodeName.REMINDER.value: NodeName.REMINDER.value,
            END: END,
        },
    )

    workflow.add_edge(NodeName.REMINDER.value, NodeName.AGENT.value)
    workflow.add_edge(NodeName.CORRECTION.value, NodeName.AGENT.value)
    workflow.add_edge(NodeName.DEFER.value, NodeName.AGGREGATOR.value)
    workflow.add_edge(NodeName.RESCHEDULE.value, NodeName.GATEKEEPER.value)
    workflow.add_edge(NodeName.END_NODE.value, END)

    for node_name, config in NODE_CONFIG.items():
        if node_name in [
            NodeName.AGENT,
            NodeName.GATEKEEPER,
            NodeName.AGGREGATOR,
            NodeName.RESCHEDULE,
            NodeName.DEFER,
            NodeName.CORRECTION,
            NodeName.REMINDER,
            NodeName.END_NODE,
        ]:
            continue

        workflow.add_edge(node_name.value, NodeName.AGGREGATOR.value)

    workflow.add_conditional_edges(
        NodeName.AGGREGATOR.value,
        post_aggregator_router,
        {
            NodeName.AGENT.value: NodeName.AGENT.value,
            NodeName.RESCHEDULE.value: NodeName.RESCHEDULE.value,
            END: END,
        },
    )

    return workflow


def build_response_agent_graph():
    return create_workflow(ResponseAgentDefinition.tool_names).compile()


def build_checkpointed_response_agent_graph(checkpointer):
    return create_workflow(ResponseAgentDefinition.tool_names).compile(
        checkpointer=checkpointer
    )


__all__ = [
    "AgentDecision",
    "GraphState",
    "NodeName",
    "ResponseAgentDefinition",
    "build_checkpointed_response_agent_graph",
    "build_response_agent_graph",
    "create_workflow",
]
