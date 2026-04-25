import argparse
import os
from pathlib import Path

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from dotenv import load_dotenv

DEFAULT_REGION = "ap-southeast-1"


def load_project_env() -> None:
    script_path = Path(__file__).resolve()

    for parent in script_path.parents:
        env_path = parent / ".env"
        if env_path.exists():
            load_dotenv(env_path, override=False)
            return


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="List Bedrock models usable with BEDROCK_API_KEY."
    )
    parser.add_argument(
        "--region",
        default=os.getenv("BEDROCK_REGION") or DEFAULT_REGION,
        help="AWS region for the Bedrock control-plane client.",
    )
    parser.add_argument(
        "--provider",
        default="",
        help="Optional provider filter, for example Amazon or Anthropic.",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Show all returned models instead of only text on-demand models.",
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
    return boto3.client("bedrock", region_name=region)


def main() -> int:
    load_project_env()
    args = parse_args()

    client = build_client(args.region)

    request: dict[str, str] = {}
    if not args.all:
        request["byInferenceType"] = "ON_DEMAND"
        request["byOutputModality"] = "TEXT"
    if args.provider:
        request["byProvider"] = args.provider

    try:
        response = client.list_foundation_models(**request)
    except (ClientError, BotoCoreError) as exc:
        raise SystemExit(f"Bedrock model listing failed: {exc}") from exc

    models = sorted(
        response.get("modelSummaries", []),
        key=lambda item: (item.get("providerName", ""), item.get("modelId", "")),
    )

    if not models:
        print("No matching models found.")
        return 0

    print(f"region={args.region}")
    print(f"count={len(models)}")
    print()

    for model in models:
        model_id = model.get("modelId", "")
        provider = model.get("providerName", "")
        inference_types = ",".join(model.get("inferenceTypesSupported", []))
        output_modalities = ",".join(model.get("outputModalities", []))
        print(f"{model_id}")
        print(f"  provider={provider}")
        print(f"  inference_types={inference_types}")
        print(f"  output_modalities={output_modalities}")
        print()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
