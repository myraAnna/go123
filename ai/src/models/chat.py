from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

ChatMessageRole = Literal["user", "assistant"]


class CreateChatSessionRequest(BaseModel):
    merchantId: str = Field(min_length=1)


class CreateChatSessionResponse(BaseModel):
    sessionId: str = Field(min_length=1)


class AskEvidence(BaseModel):
    label: str = Field(min_length=1)
    value: str | None = None
    valueCents: int | None = None
    valuePct: float | None = None

    @model_validator(mode="after")
    def validate_value_payload(self) -> "AskEvidence":
        if self.value is None and self.valueCents is None and self.valuePct is None:
            raise ValueError("evidence requires one of value, valueCents, or valuePct")
        return self


class ChatSessionMessage(BaseModel):
    role: ChatMessageRole
    content: str = Field(min_length=1)
    evidence: list[AskEvidence] | None = None
    createdAt: str = Field(min_length=1)

    @field_validator("content")
    @classmethod
    def normalize_content(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("content is required")
        return value

    @model_validator(mode="after")
    def validate_evidence_scope(self) -> "ChatSessionMessage":
        if self.role != "assistant" and self.evidence:
            raise ValueError("only assistant messages may include evidence")
        return self


class GetChatSessionMessagesRequest(BaseModel):
    sessionId: str = Field(min_length=1)
    merchantId: str = Field(min_length=1)


class GetChatSessionMessagesResponse(BaseModel):
    sessionId: str = Field(min_length=1)
    messages: list[ChatSessionMessage]


class AskRequest(BaseModel):
    sessionId: str = Field(min_length=1)
    question: str = Field(min_length=1)
    merchantId: str = Field(min_length=1)

    @field_validator("question")
    @classmethod
    def normalize_question(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("question is required")
        return value


class AskQueryTrace(BaseModel):
    name: str = Field(min_length=1)
    rowCount: int = Field(ge=0)
    durationMs: int = Field(ge=0)


class AskResponse(BaseModel):
    answer: str = Field(min_length=1)
    evidence: list[AskEvidence]
    queries: list[AskQueryTrace] | None = None


class SuggestQuestionsRequest(BaseModel):
    sessionId: str = Field(min_length=1)
    merchantId: str = Field(min_length=1)


class SuggestQuestionsResponse(BaseModel):
    suggestedQuestions: list[str]

    @field_validator("suggestedQuestions")
    @classmethod
    def validate_suggested_questions(cls, value: list[str]) -> list[str]:
        cleaned = [question.strip() for question in value if question.strip()]
        if not cleaned:
            raise ValueError("suggestedQuestions must include at least one question")
        return cleaned
