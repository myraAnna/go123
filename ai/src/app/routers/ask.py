import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.types import Command
from pydantic import BaseModel

from src.app.agents.analytics_agent import (
    NoAnalyticsDataError,
    UnsupportedQuestionError,
    get_analytics_agent,
)
from src.app.agents.response_agent import build_checkpointed_response_agent_graph
from src.app.db.readonly_pg import ReadOnlyQueryError
from src.app.deps import get_config
from src.app.session_store import (
    SessionStoreError,
    append_assistant_message,
    append_user_message,
    get_session,
)
from src.app.utils.bedrock_client import BedrockClientError
from src.models.chat import AskRequest, AskResponse

try:
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
except ImportError:  # pragma: no cover - import guard for runtime env
    AsyncPostgresSaver = None

logger = logging.getLogger(__name__)

router = APIRouter()


class ResponseAgentAskRequest(BaseModel):
    sessionId: str
    question: str
    merchantId: str


class ResponseAgentAskResponse(BaseModel):
    answer: str


class ResponseAgentStateResponse(BaseModel):
    sessionId: str
    messages: list[dict[str, Any]]


def _serialize_graph_message(message: BaseMessage) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "type": getattr(message, "type", message.__class__.__name__.lower()),
        "content": message.content,
        "additionalKwargs": message.additional_kwargs,
    }

    if isinstance(message, AIMessage):
        payload["toolCalls"] = getattr(message, "tool_calls", [])
    if isinstance(message, ToolMessage):
        payload["toolCallId"] = message.tool_call_id
        payload["name"] = getattr(message, "name", None)
    if isinstance(message, (HumanMessage, SystemMessage)):
        payload["name"] = getattr(message, "name", None)

    message_id = getattr(message, "id", None)
    if message_id is not None:
        payload["id"] = message_id

    return payload


# @router.post("/chat/ask", response_model=AskResponse)
# def ask(request: AskRequest):
#     try:
#         session = get_session(request.sessionId, request.merchantId)
#     except KeyError as exc:
#         logger.exception(
#             "ask session lookup failed: unknown sessionId=%s merchantId=%s",
#             request.sessionId,
#             request.merchantId,
#         )
#         raise HTTPException(status_code=404, detail="unknown sessionId") from exc
#     except PermissionError as exc:
#         logger.exception(
#             "ask session lookup failed: permission denied sessionId=%s merchantId=%s",
#             request.sessionId,
#             request.merchantId,
#         )
#         raise HTTPException(
#             status_code=409,
#             detail="session does not belong to the supplied merchantId",
#         ) from exc
#     except SessionStoreError as exc:
#         logger.exception(
#             "ask session lookup failed: store error sessionId=%s merchantId=%s",
#             request.sessionId,
#             request.merchantId,
#         )
#         raise HTTPException(status_code=500, detail=str(exc)) from exc

#     prior_messages = list(session.messages)

#     try:
#         append_user_message(request.sessionId, request.merchantId, request.question)
#     except SessionStoreError as exc:
#         logger.exception(
#             "ask failed to persist user message sessionId=%s merchantId=%s",
#             request.sessionId,
#             request.merchantId,
#         )
#         raise HTTPException(status_code=500, detail=str(exc)) from exc

#     try:
#         response = get_analytics_agent().answer_question(
#             request,
#             prior_messages,
#             session.time_zone,
#         )
#     except (UnsupportedQuestionError, NoAnalyticsDataError) as exc:
#         logger.exception(
#             "ask analytics validation failed sessionId=%s merchantId=%s",
#             request.sessionId,
#             request.merchantId,
#         )
#         raise HTTPException(status_code=422, detail=str(exc)) from exc
#     except (BedrockClientError, ReadOnlyQueryError) as exc:
#         logger.exception(
#             "ask analytics execution failed sessionId=%s merchantId=%s",
#             request.sessionId,
#             request.merchantId,
#         )
#         raise HTTPException(status_code=500, detail=str(exc)) from exc

#     try:
#         append_assistant_message(
#             request.sessionId,
#             request.merchantId,
#             response.answer,
#             response.evidence,
#         )
#     except SessionStoreError as exc:
#         logger.exception(
#             "ask failed to persist assistant message sessionId=%s merchantId=%s",
#             request.sessionId,
#             request.merchantId,
#         )
#         raise HTTPException(status_code=500, detail=str(exc)) from exc

#     return response


@router.post("/chat/ask", response_model=ResponseAgentAskResponse)
async def ask_agent(request: ResponseAgentAskRequest):
    try:
        get_session(request.sessionId, request.merchantId)
    except KeyError as exc:
        logger.exception(
            "ask-agent session lookup failed: unknown sessionId=%s merchantId=%s",
            request.sessionId,
            request.merchantId,
        )
        raise HTTPException(status_code=404, detail="unknown sessionId") from exc
    except PermissionError as exc:
        logger.exception(
            "ask-agent session lookup failed: permission denied sessionId=%s merchantId=%s",
            request.sessionId,
            request.merchantId,
        )
        raise HTTPException(
            status_code=409,
            detail="session does not belong to the supplied merchantId",
        ) from exc
    except SessionStoreError as exc:
        logger.exception(
            "ask-agent session lookup failed: store error sessionId=%s merchantId=%s",
            request.sessionId,
            request.merchantId,
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    try:
        append_user_message(request.sessionId, request.merchantId, request.question)
    except SessionStoreError as exc:
        logger.exception(
            "ask-agent failed to persist user message sessionId=%s merchantId=%s",
            request.sessionId,
            request.merchantId,
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    try:
        if AsyncPostgresSaver is None:
            raise RuntimeError(
                "Missing LangGraph async Postgres checkpoint support. Install langgraph-checkpoint-postgres."
            )

        database_url = get_config().database_url
        if not database_url:
            raise RuntimeError("Missing DATABASE_URL for response agent checkpoints.")

        config = {"configurable": {"thread_id": request.sessionId}}
        async with AsyncPostgresSaver.from_conn_string(database_url) as checkpointer:
            await checkpointer.setup()
            graph = build_checkpointed_response_agent_graph(checkpointer)
            result = await graph.ainvoke(
                {
                    "merchant_id": request.merchantId,
                    "messages": [HumanMessage(content=request.question)],
                },
                config=config,
            )

            interrupts = result.get("__interrupt__", [])
            if interrupts:
                interrupt_value = getattr(interrupts[0], "value", interrupts[0])
                resumed_result = await graph.ainvoke(
                    Command(resume=str(interrupt_value)),
                    config=config,
                )

                answer = str(interrupt_value)
                resumed_messages = resumed_result.get("messages", [])
                if resumed_messages:
                    last_message = resumed_messages[-1]
                    content = getattr(last_message, "content", "")
                    if isinstance(content, str) and content.strip():
                        answer = content.strip()

                try:
                    append_assistant_message(
                        request.sessionId,
                        request.merchantId,
                        answer,
                        [],
                    )
                except SessionStoreError as exc:
                    logger.exception(
                        "ask-agent failed to persist assistant message sessionId=%s merchantId=%s",
                        request.sessionId,
                        request.merchantId,
                    )
                    raise HTTPException(status_code=500, detail=str(exc)) from exc

                return ResponseAgentAskResponse(answer=answer)

            messages = result.get("messages", [])
            if messages:
                last_message = messages[-1]
                content = getattr(last_message, "content", "")
                if isinstance(content, list):
                    content = "\n".join(str(item) for item in content)
                answer = str(content)
                try:
                    append_assistant_message(
                        request.sessionId,
                        request.merchantId,
                        answer,
                        [],
                    )
                except SessionStoreError as exc:
                    logger.exception(
                        "ask-agent failed to persist assistant message sessionId=%s merchantId=%s",
                        request.sessionId,
                        request.merchantId,
                    )
                    raise HTTPException(status_code=500, detail=str(exc)) from exc
                return ResponseAgentAskResponse(answer=answer)
    except BedrockClientError as exc:
        logger.exception(
            "ask-agent initial invoke failed sessionId=%s merchantId=%s",
            request.sessionId,
            request.merchantId,
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except RuntimeError as exc:
        logger.exception(
            "ask-agent graph setup failed sessionId=%s merchantId=%s",
            request.sessionId,
            request.merchantId,
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception(
            "ask-agent unexpected initial invoke failure sessionId=%s merchantId=%s",
            request.sessionId,
            request.merchantId,
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    raise HTTPException(status_code=500, detail="agent did not return a response")


@router.get(
    "/chat/ask-agent/state/{session_id}",
    response_model=ResponseAgentStateResponse,
)
async def get_ask_agent_state(session_id: str):
    try:
        if AsyncPostgresSaver is None:
            raise RuntimeError(
                "Missing LangGraph async Postgres checkpoint support. Install langgraph-checkpoint-postgres."
            )

        database_url = get_config().database_url
        if not database_url:
            raise RuntimeError("Missing DATABASE_URL for response agent checkpoints.")

        config = {"configurable": {"thread_id": session_id}}
        async with AsyncPostgresSaver.from_conn_string(database_url) as checkpointer:
            await checkpointer.setup()
            graph = build_checkpointed_response_agent_graph(checkpointer)
            snapshot = await graph.aget_state(config)
    except RuntimeError as exc:
        logger.exception(
            "ask-agent state lookup failed sessionId=%s",
            session_id,
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception(
            "ask-agent unexpected state lookup failure sessionId=%s",
            session_id,
        )
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    values = snapshot.values if isinstance(snapshot.values, dict) else {}
    raw_messages = values.get("messages", [])
    messages = [
        _serialize_graph_message(message)
        for message in raw_messages
        if isinstance(message, BaseMessage)
    ]
    return ResponseAgentStateResponse(sessionId=session_id, messages=messages)
