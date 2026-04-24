from pydantic import BaseModel
from typing import Optional

class Config(BaseModel):
    aws_region: str = "ap-southeast-1"
    bedrock_model: str = "anthropic.claude-3-haiku-20240307-v1:0"
    fake_mode: bool = False

# Singleton config
config = Config()
