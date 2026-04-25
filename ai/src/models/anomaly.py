from pydantic import BaseModel, Field


class AnomalySeriesPoint(BaseModel):
    date: str = Field(min_length=1)
    revenueCents: int = Field(ge=0)


class AnomalyRequest(BaseModel):
    series: list[AnomalySeriesPoint] = Field(min_length=1)


class AnomalyResponse(BaseModel):
    isAnomaly: bool
    expectedCents: int = Field(ge=0)
    actualCents: int = Field(ge=0)
    zScore: float
