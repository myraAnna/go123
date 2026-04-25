import os
import statistics

from fastapi import APIRouter

from src.models.anomaly import AnomalyRequest, AnomalyResponse

router = APIRouter()

@router.post("/anomaly", response_model=AnomalyResponse)
def detect_anomaly(request: AnomalyRequest):
    if os.getenv("FAKE_MODE") == "1":
        return AnomalyResponse(
            isAnomaly=True,
            expectedCents=27000,
            actualCents=18000,
            zScore=-2.1,
        )
    
    revenues = [item.revenueCents for item in request.series]

    if len(revenues) < 2:
        return AnomalyResponse(
            isAnomaly=False,
            expectedCents=revenues[0] if revenues else 0,
            actualCents=revenues[-1] if revenues else 0,
            zScore=0.0,
        )

    mean = statistics.mean(revenues)
    stdev = statistics.stdev(revenues)

    if stdev == 0:
        return AnomalyResponse(
            isAnomaly=False,
            expectedCents=int(mean),
            actualCents=revenues[-1],
            zScore=0.0,
        )

    actual = revenues[-1]
    z_score = (actual - mean) / stdev

    return AnomalyResponse(
        isAnomaly=abs(z_score) > 2.0,
        expectedCents=int(mean),
        actualCents=actual,
        zScore=round(z_score, 2),
    )
