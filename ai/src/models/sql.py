from pydantic import BaseModel, Field

class TextToSqlRequest(BaseModel):
    question: str
    schema: str = Field(..., description="Database schema")

class TextToSqlResponse(BaseModel):
    sql: str
    explanation: str

class AnomalyRequest(BaseModel):
    series: list[dict]  # [{ "date": "2026-04-20", "revenueCents": 25000 }]

class AnomalyResponse(BaseModel):
    isAnomaly: bool
    expectedCents: int
    actualCents: int
    zScore: float
