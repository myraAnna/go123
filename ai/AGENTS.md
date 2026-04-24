# ai/ — FastAPI AI

**Rule**: Stateless LLM inference only. No DB, no auth, no business logic.

## Stack
- FastAPI, Bedrock (Claude Haiku)
- Package manager: `uv` + Python 3.13
- Port: 8001

## Endpoints

**Menu**: `POST /v1/parse-menu` → LLM parses transcript → structured items  
**SQL**: `POST /v1/text-to-sql` → BM/English question → SELECT query  
**Anomaly**: `POST /v1/anomaly` → Z-score detection (optional)  
**Health**: `GET /health`

See `CONTRACTS.md` for shapes.

## Key Rules
- No `id` in parse-menu output (api/ assigns)
- SELECT-only SQL (no DDL/DML)
- Use `AT TIME ZONE 'Asia/Kuala_Lumpur'` for time queries
- Categories: `"main" | "side" | "drink" | "dessert" | "other"`

## Bedrock Client
```python
import boto3
bedrock = boto3.client('bedrock-runtime', region_name='ap-southeast-1')
response = bedrock.invoke_model(modelId='anthropic.claude-3-haiku-20240307-v1:0', ...)
```

## Prompts
Store in `src/prompts/`. Menu parsing + text-to-SQL templates.

## Pydantic Models
```python
class MenuItem(BaseModel):
    name: str
    priceCents: int
    category: Literal["main", "side", "drink", "dessert", "other"]
    color: str
```

## FAKE_MODE=1
Bypass Bedrock, return fixtures from `src/fixtures/*.json`

## Quick Start
```bash
uv sync && uv run uvicorn src.main:app --reload --port 8001
```

## Don't
- Handle auth/sessions
- Access database
- Implement business logic
- Store money as floats
