from typing import TypedDict

from src.models.chat import AskEvidence, AskQueryTrace, ChatSessionMessage


class AnalyticsState(TypedDict, total=False):
    question: str
    merchantId: str
    timeZone: str
    priorMessages: list[ChatSessionMessage]
    conversationContext: str
    intent: str
    rows: list[dict]
    evidence: list[AskEvidence]
    queries: list[AskQueryTrace]
    answer: str
