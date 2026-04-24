from fastapi import APIRouter
from models.sql import TextToSqlRequest, TextToSqlResponse
import os

router = APIRouter()

@router.post("/text-to-sql", response_model=TextToSqlResponse)
def text_to_sql(request: TextToSqlRequest):
    """Convert natural language question to SQL query"""
    
    # TODO: Implement Bedrock LLM call
    # For now, return mock data
    
    if os.getenv("FAKE_MODE") == "1":
        return TextToSqlResponse(
            sql="SELECT * FROM orders LIMIT 10",
            explanation="Returns first 10 orders"
        )
    
    # TODO: Call Bedrock Claude Haiku
    # - Load prompt from src/prompts/text_to_sql.txt
    # - Invoke Bedrock with question + schema
    # - Validate SELECT-only SQL
    # - Return SQL + explanation
    
    return TextToSqlResponse(sql="", explanation="")
