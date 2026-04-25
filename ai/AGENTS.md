# ai/ — FastAPI AI

**Rule**: Menu parsing and conversational analytics only. No auth ownership, no shared business-data writes.

## Stack
- FastAPI, Bedrock (Claude Haiku)
- Package manager: `uv` + Python 3.13
- Port: 8001

## Endpoints

**Menu**: `POST /v1/onboarding/extract-menu` → AI parses text/files → structured draft items  
**Chat**: `POST /v1/chat/sessions` → create AI-owned chat session  
**Messages**: `GET /v1/chat/sessions/:id/messages` → return stored AI chat history  
**Ask**: `POST /v1/chat/ask` → session-aware conversational analytics response  
**Suggest**: `POST /v1/chat/suggest-questions` → return suggested follow-up questions  
**Anomaly**: `POST /v1/anomaly` → Z-score detection (optional)  
**Health**: `GET /health`

See `../.claude/specs/CONTRACTS.md` for shapes.

## Key Rules
- No `id` in parse-menu output (api/ assigns)
- Chat history is AI-owned session state
- Merchant data access is read-only and merchant-scoped
- Use `AT TIME ZONE 'Asia/Kuala_Lumpur'` for time queries
- Categories: `"main" | "side" | "drink" | "dessert" | "other"`

## Bedrock Client
```python
import boto3
bedrock = boto3.client('bedrock-runtime', region_name='ap-southeast-1')
response = bedrock.invoke_model(modelId='anthropic.claude-3-haiku-20240307-v1:0', ...)
```

## Prompts
Store in `src/prompts/`. Menu parsing + conversational analytics templates.

## Pydantic Models

Define request/response schemas for:
- parse menu input/output
- chat session creation
- chat message retrieval
- ask response evidence/query traces
- suggested questions
- anomaly input/output

## FAKE_MODE=1
Bypass Bedrock, return fixtures from `src/fixtures/*.json`

## Quick Start
```bash
make dev-ai     # Starts on http://localhost:8001
```

Or manually:
```bash
uv sync && uv run uvicorn src.main:app --reload --port 8001
```

## Don't
- Own shared business-data writes
- Own auth
- Store money as floats
