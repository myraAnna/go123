import argparse
import json
import os
import sys

import boto3
from botocore.exceptions import BotoCoreError, ClientError

DEFAULT_MODEL = "anthropic.claude-3-haiku-20240307-v1:0"
DEFAULT_REGION = "ap-southeast-1"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Smoke test Amazon Bedrock runtime access with boto3."
    )
    parser.add_argument(
        "--region",
        default=(
            os.getenv("BEDROCK_REGION")
            or os.getenv("AWS_REGION")
            or os.getenv("AWS_DEFAULT_REGION")
            or DEFAULT_REGION
        ),
        help="AWS region for the Bedrock runtime client.",
    )
    parser.add_argument(
        "--model",
        default=os.getenv("BEDROCK_MODEL", DEFAULT_MODEL),
        help="Bedrock model ID.",
    )
    parser.add_argument(
        "--prompt",
        default="Reply with one short sentence confirming Bedrock is working.",
        help="Prompt to send to the model.",
    )
    parser.add_argument(
        "--max-tokens",
        type=int,
        default=256,
        help="Maximum output tokens.",
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=0.2,
        help="Sampling temperature.",
    )
    return parser.parse_args()


def auth_mode() -> str:
    if os.getenv("AWS_BEARER_TOKEN_BEDROCK"):
        return "bedrock-api-key"
    return "aws-sdk-credentials"


def build_client(region: str):
    return boto3.client("bedrock-runtime", region_name=region)


def extract_text(response: dict) -> str:
    content = response.get("output", {}).get("message", {}).get("content", [])
    text_parts = [block.get("text", "") for block in content if "text" in block]
    return "\n".join(part for part in text_parts if part).strip()


def main() -> int:
    args = parse_args()

    client = build_client(args.region)
    print(f"auth_mode={auth_mode()}")
    print(f"region={args.region}")
    print(f"model={args.model}")

    try:
        response = client.converse(
            modelId=args.model,
            messages=[
                {
                    "role": "user",
                    "content": [{"text": args.prompt}],
                }
            ],
            inferenceConfig={
                "maxTokens": args.max_tokens,
                "temperature": args.temperature,
            },
        )
    except (ClientError, BotoCoreError) as exc:
        print("Bedrock call failed.", file=sys.stderr)
        print(str(exc), file=sys.stderr)
        print(file=sys.stderr)
        print("Checks:", file=sys.stderr)
        print(
            "1. Set either AWS credentials or AWS_BEARER_TOKEN_BEDROCK.",
            file=sys.stderr,
        )
        print(
            (
                f"2. Use a Bedrock-supported region such as {args.region} "
                "and a model enabled there."
            ),
            file=sys.stderr,
        )
        print(
            (
                "3. Ensure the principal or API key has permission to call "
                "bedrock-runtime."
            ),
            file=sys.stderr,
        )
        print(
            (
                "4. Bedrock API keys do not work with bedrock-agent-runtime "
                "or Agents APIs."
            ),
            file=sys.stderr,
        )
        return 1

    text = extract_text(response)
    usage = response.get("usage", {})

    print("response_text:")
    print(text or "<empty>")
    print("usage:")
    print(json.dumps(usage, indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
