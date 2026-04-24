from pydantic import BaseModel
from typing import Literal

CategoryType = Literal["main", "side", "drink", "dessert", "other"]

class MenuItem(BaseModel):
    name: str
    priceCents: int
    category: CategoryType
    color: str  # hex string

class MenuParseRequest(BaseModel):
    transcript: str

class MenuParseResponse(BaseModel):
    items: list[MenuItem]
