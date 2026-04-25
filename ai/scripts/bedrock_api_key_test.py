import argparse
import json
import os
import sys
from pathlib import Path

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from dotenv import load_dotenv

DEFAULT_MODEL = "amazon.nova-micro-v1:0"
DEFAULT_REGION = "ap-southeast-5"
KNOWN_API_KEY_REGIONS = {
    "ap-northeast-1",
    "ap-northeast-2",
    "ap-northeast-3",
    "ap-south-1",
    "ap-south-2",
    "ap-southeast-1",
    "ap-southeast-2",
    "ca-central-1",
    "eu-central-1",
    "eu-central-2",
    "eu-north-1",
    "eu-south-1",
    "eu-south-2",
    "eu-west-1",
    "eu-west-2",
    "eu-west-3",
    "sa-east-1",
    "us-east-1",
    "us-gov-east-1",
    "us-gov-west-1",
    "us-west-2",
}


def load_project_env() -> None:
    script_path = Path(__file__).resolve()

    for parent in script_path.parents:
        env_path = parent / ".env"
        if env_path.exists():
            load_dotenv(env_path, override=False)
            return


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Smoke test Amazon Bedrock using BEDROCK_API_KEY only."
    )
    parser.add_argument(
        "--region",
        default=os.getenv("BEDROCK_REGION") or DEFAULT_REGION,
        help="AWS region for the Bedrock runtime client.",
    )
    parser.add_argument(
        "--model",
        default=os.getenv("BEDROCK_MODEL", DEFAULT_MODEL),
        help="Bedrock model ID.",
    )
    parser.add_argument(
        "--prompt",
        default="Reply with one short sentence saying hello.",
        help="Prompt to send to Bedrock.",
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


def build_client(region: str):
    os.environ.pop("AWS_ACCESS_KEY_ID", None)
    os.environ.pop("AWS_SECRET_ACCESS_KEY", None)
    os.environ.pop("AWS_SESSION_TOKEN", None)
    os.environ["AWS_BEARER_TOKEN_BEDROCK"] = get_api_key()
    return boto3.client("bedrock-runtime", region_name=region)


def extract_text(response: dict) -> str:
    content = response.get("output", {}).get("message", {}).get("content", [])
    text_parts = [block.get("text", "") for block in content if "text" in block]
    return "\n".join(part for part in text_parts if part).strip()


def main() -> int:
    load_project_env()
    args = parse_args()

    print("auth_mode=bedrock-api-key-only")
    print(f"region={args.region}")
    print(f"model={args.model}")

    if args.region not in KNOWN_API_KEY_REGIONS:
        print(
            (
                f"warning: {args.region} is not in the current Bedrock API key "
                "supported-region list from AWS docs."
            ),
            file=sys.stderr,
        )

    client = build_client(args.region)

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
        return 1

    print("response_text:")
    print(extract_text(response) or "<empty>")
    print("usage:")
    print(json.dumps(response.get("usage", {}), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
