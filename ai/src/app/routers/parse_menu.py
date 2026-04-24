from fastapi import APIRouter
from models.menu import MenuParseRequest, MenuParseResponse
import os

router = APIRouter()

@router.post("/parse-menu", response_model=MenuParseResponse)
def parse_menu(request: MenuParseRequest):
    """Parse natural language menu description into structured items"""
    
    # TODO: Implement Bedrock LLM call
    # For now, return mock data
    
    if os.getenv("FAKE_MODE") == "1":
        # Return fixture
        return MenuParseResponse(
            items=[
                {
                    "name": "Nasi Lemak",
                    "priceCents": 500,
                    "category": "main",
                    "color": "#F59E0B"
                },
                {
                    "name": "Teh Tarik",
                    "priceCents": 200,
                    "category": "drink",
                    "color": "#78350F"
                }
            ]
        )
    
    # TODO: Call Bedrock Claude Haiku
    # - Load prompt from src/prompts/menu_parse.txt
    # - Invoke Bedrock with transcript
    # - Parse JSON response
    # - Return structured items
    
    return MenuParseResponse(items=[])
