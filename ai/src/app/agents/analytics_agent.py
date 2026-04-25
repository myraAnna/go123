import json
from functools import lru_cache

from langchain_core.messages import HumanMessage
from langgraph.graph import END, StateGraph
from pydantic import BaseModel

from src.app.agents.analytics_catalog import build_catalog_summary, get_task
from src.app.agents.analytics_state import AnalyticsState
from src.app.agents.prompts import render_prompt
from src.app.db.readonly_pg import ReadOnlyPostgres
from src.app.deps import get_config
from src.app.utils.bedrock_client import ChatBedrockClient
from src.app.utils.file_sniff import build_chat_text_block
from src.models.chat import AskRequest, AskResponse, ChatSessionMessage


class UnsupportedQuestionError(RuntimeError):
    pass


class NoAnalyticsDataError(RuntimeError):
    pass


class AnalyticsRouteDecision(BaseModel):
    intent: str


def _summarize_messages(messages: list[ChatSessionMessage]) -> str:
    if not messages:
        return "No prior messages."

    recent_messages = messages[-6:]
    return "\n".join(
        f"{message.role}: {message.content}" for message in recent_messages
    )


class AnalyticsAgent:
    def __init__(self):
        self.config = get_config()
        self.graph = self._build_graph()

    @property
    def chat_model(self) -> ChatBedrockClient:
        return ChatBedrockClient()

    @property
    def readonly_pg(self) -> ReadOnlyPostgres:
        return ReadOnlyPostgres()

    def _build_graph(self):
        workflow = StateGraph(AnalyticsState)
        workflow.add_node("load_context", self._load_context)
        workflow.add_node("route_question", self._route_question)
        workflow.add_node("run_query", self._run_query)
        workflow.add_node("build_evidence", self._build_evidence)
        workflow.add_node("generate_answer", self._generate_answer)
        workflow.set_entry_point("load_context")
        workflow.add_edge("load_context", "route_question")
        workflow.add_edge("route_question", "run_query")
        workflow.add_edge("run_query", "build_evidence")
        workflow.add_edge("build_evidence", "generate_answer")
        workflow.add_edge("generate_answer", END)
        return workflow.compile()

    def _load_context(self, state: AnalyticsState) -> AnalyticsState:
        return {"conversationContext": _summarize_messages(state["priorMessages"])}

    def _route_question(self, state: AnalyticsState) -> AnalyticsState:
        prompt = render_prompt(
            "analytics-router.txt",
            catalog=build_catalog_summary(),
            question=state["question"],
            prior_messages=state["conversationContext"],
        )
        decision = self.chat_model.invoke_structured(
            [HumanMessage(content=[build_chat_text_block(prompt)])],
            AnalyticsRouteDecision,
            # max_tokens=250,
            temperature=0.0,
        )
        intent = decision.intent.strip() or "unsupported"
        if not get_task(intent):
            raise UnsupportedQuestionError(
                "Soalan itu belum disokong lagi untuk analytics query semasa."
            )
        return {"intent": intent}

    def _run_query(self, state: AnalyticsState) -> AnalyticsState:
        task = get_task(state["intent"])
        if task is None:
            raise UnsupportedQuestionError(
                "Soalan itu belum disokong lagi untuk analytics query semasa."
            )

        try:
            merchant_id = int(state["merchantId"])
        except ValueError as exc:
            raise UnsupportedQuestionError("merchantId mesti nombor yang sah.") from exc

        result = self.readonly_pg.run_query(
            name=task.name,
            sql=task.sql,
            params=task.build_params(merchant_id, state["timeZone"]),
        )

        if not task.has_data(result.rows):
            raise NoAnalyticsDataError(task.no_data_message)

        return {"rows": result.rows, "queries": [result.trace]}

    def _build_evidence(self, state: AnalyticsState) -> AnalyticsState:
        task = get_task(state["intent"])
        if task is None:
            raise UnsupportedQuestionError(
                "Soalan itu belum disokong lagi untuk analytics query semasa."
            )
        return {"evidence": task.build_evidence(state["rows"])}

    def _generate_answer(self, state: AnalyticsState) -> AnalyticsState:
        prompt = render_prompt(
            "analytics-answer.txt",
            question=state["question"],
            intent=state["intent"],
            prior_messages=state["conversationContext"],
            rows_json=json.dumps(state["rows"], ensure_ascii=True),
            evidence_json=json.dumps(
                [
                    evidence.model_dump(exclude_none=True)
                    for evidence in state["evidence"]
                ],
                ensure_ascii=True,
            ),
        )
        answer = self.chat_model.invoke_text(
            [HumanMessage(content=[build_chat_text_block(prompt)])],
            # max_tokens=250,
            temperature=0.2,
        )
        return {"answer": answer.strip()}

    def answer_question(
        self,
        request: AskRequest,
        prior_messages: list[ChatSessionMessage],
        time_zone: str,
    ) -> AskResponse:
        if self.config.fake_mode:
            return AskResponse(
                answer="Mode demo: Selasa nampak paling perlahan setakat ini.",
                evidence=[
                    {"label": "dayName", "value": "Selasa"},
                    {"label": "revenueCents", "valueCents": 12000},
                ],
                queries=[
                    {"name": "slowest-day-this-month", "rowCount": 1, "durationMs": 0}
                ],
            )

        result = self.graph.invoke(
            {
                "question": request.question,
                "merchantId": request.merchantId,
                "timeZone": time_zone,
                "priorMessages": prior_messages,
            }
        )
        return AskResponse(
            answer=result["answer"],
            evidence=result["evidence"],
            queries=result.get("queries"),
        )


@lru_cache(maxsize=1)
def get_analytics_agent() -> AnalyticsAgent:
    return AnalyticsAgent()
