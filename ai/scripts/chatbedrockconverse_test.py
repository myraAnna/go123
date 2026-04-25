import argparse
import os
from pathlib import Path

from dotenv import load_dotenv
from langchain_core.language_models import LanguageModelInput


def load_project_env() -> None:
    script_path = Path(__file__).resolve()

    for parent in script_path.parents:
        env_path = parent / ".env"
        if env_path.exists():
            load_dotenv(env_path, override=False)
            return


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Smoke test ChatBedrockConverse with BEDROCK_API_KEY only."
    )
    parser.add_argument(
        "--region",
        default=os.getenv("BEDROCK_REGION") or "ap-southeast-1",
        help="Bedrock region.",
    )
    parser.add_argument(
        "--model",
        default=(
            os.getenv("BEDROCK_MODEL") or "anthropic.claude-3-haiku-20240307-v1:0"
        ),
        help="Bedrock model ID.",
    )
    parser.add_argument(
        "--prompt",
        default="say hi",
        help="Prompt to send.",
    )
    parser.add_argument(
        "--max-tokens",
        type=int,
        default=128,
        help="Maximum output tokens.",
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=0.2,
        help="Sampling temperature.",
    )
    return parser.parse_args()


def get_api_key() -> str:
    api_key = os.getenv("BEDROCK_API_KEY", "").strip()
    if not api_key:
        raise SystemExit(
            "Missing BEDROCK_API_KEY. Set it in the environment or repo .env file."
        )
    return api_key


def extract_text(content: object) -> str:
    if isinstance(content, str):
        return content

    if isinstance(content, list):
        text_parts: list[str] = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                text_parts.append(str(block.get("text", "")))
        return "\n".join(part for part in text_parts if part).strip()

    return str(content)


def main() -> int:
    load_project_env()
    args = parse_args()

    from langchain_aws import ChatBedrockConverse

    model = ChatBedrockConverse(
        model=args.model,
        region_name=args.region,
        bedrock_api_key=get_api_key(),
        max_tokens=args.max_tokens,
        temperature=args.temperature,
    )

    print("auth_mode=bedrock-api-key-only")
    print(f"region={args.region}")
    print(f"model={args.model}")

    messages: LanguageModelInput = [
        ("system", "You are a concise assistant."),
        ("human", args.prompt),
    ]

    try:
        response = model.invoke(messages)
    except Exception as exc:
        print("Bedrock call failed.")
        print(str(exc))
        return 1

    print("response_text:")
    print(extract_text(response.content) or "<empty>")
    print("usage:")
    print(response.usage_metadata or {})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
