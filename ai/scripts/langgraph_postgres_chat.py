import argparse
import os
import sys
import uuid
from pathlib import Path
from typing import Callable

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from dotenv import load_dotenv
from typing_extensions import Annotated, TypedDict

try:
    from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
    from langgraph.checkpoint.postgres import PostgresSaver
    from langgraph.graph import END, StateGraph
    from langgraph.graph.message import add_messages
except ImportError as exc:
    raise SystemExit(
        "Missing LangGraph dependencies. Run `uv sync` in `ai/` to install "
        "`langgraph`, `langgraph-checkpoint-postgres`, and `psycopg[binary]`."
    ) from exc

DEFAULT_DB_URL = "postgres://postgres:postgres@localhost:5432/postgres?sslmode=disable"
DEFAULT_MODEL = "anthropic.claude-3-haiku-20240307-v1:0"
DEFAULT_REGION = "ap-southeast-1"


def load_project_env() -> None:
    script_path = Path(__file__).resolve()

    for parent in script_path.parents:
        env_path = parent / ".env"
        if env_path.exists():
            load_dotenv(env_path, override=False)
            return


class ChatState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Interactive LangGraph chat with Postgres-backed checkpoints."
    )
    parser.add_argument(
        "--db-url",
        default=(
            os.getenv("LANGGRAPH_POSTGRES_URL")
            or os.getenv("DATABASE_URL")
            or DEFAULT_DB_URL
        ),
        help="Postgres connection string for PostgresSaver.",
    )
    parser.add_argument(
        "--thread-id",
        default=os.getenv("LANGGRAPH_THREAD_ID") or f"chat-{uuid.uuid4()}",
        help="LangGraph thread ID used for checkpointing.",
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
    parser.add_argument(
        "--history-limit",
        type=int,
        default=3,
        help="How many recent checkpoints to print when the session ends.",
    )
    return parser.parse_args()


def auth_mode() -> str:
    if os.getenv("BEDROCK_API_KEY"):
        return "bedrock-api-key-only"
    return "missing-bedrock-api-key"


def get_api_key() -> str:
    api_key = os.getenv("BEDROCK_API_KEY", "").strip()
    if not api_key:
        raise SystemExit(
            "Missing BEDROCK_API_KEY. This script only supports Bedrock API key auth."
        )
    return api_key


def build_bedrock_client(region: str):
    os.environ.pop("AWS_ACCESS_KEY_ID", None)
    os.environ.pop("AWS_SECRET_ACCESS_KEY", None)
    os.environ.pop("AWS_SESSION_TOKEN", None)
    os.environ["AWS_BEARER_TOKEN_BEDROCK"] = get_api_key()
    return boto3.client("bedrock-runtime", region_name=region)


def to_bedrock_messages(messages: list[BaseMessage]) -> list[dict]:
    conversation: list[dict] = []

    for message in messages:
        if isinstance(message, AIMessage):
            role = "assistant"
        else:
            role = "user"

        conversation.append(
            {
                "role": role,
                "content": [{"text": str(message.content)}],
            }
        )

    return conversation


def extract_text(response: dict) -> str:
    blocks = response.get("output", {}).get("message", {}).get("content", [])
    text_parts = [block.get("text", "") for block in blocks if "text" in block]
    return "\n".join(part for part in text_parts if part).strip()


def make_chat_node(
    *,
    region: str,
    model: str,
    max_tokens: int,
    temperature: float,
) -> Callable[[ChatState], ChatState]:
    client = build_bedrock_client(region)

    def chat_node(state: ChatState) -> ChatState:
        response = client.converse(
            modelId=model,
            messages=to_bedrock_messages(list(state["messages"])),
            inferenceConfig={
                "maxTokens": max_tokens,
                "temperature": temperature,
            },
        )
        return {"messages": [AIMessage(content=extract_text(response))]}

    return chat_node


def build_graph(
    *,
    region: str,
    model: str,
    max_tokens: int,
    temperature: float,
    checkpointer: PostgresSaver,
):
    workflow = StateGraph(ChatState)
    workflow.add_node(
        "chat",
        make_chat_node(
            region=region,
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
        ),
    )
    workflow.set_entry_point("chat")
    workflow.add_edge("chat", END)
    return workflow.compile(checkpointer=checkpointer)


def print_existing_context(graph, config: dict) -> None:
    snapshot = graph.get_state(config)
    values = getattr(snapshot, "values", None) or {}
    messages = values.get("messages", [])

    if not messages:
        print("No prior checkpointed messages for this thread.")
        return

    print(f"Loaded {len(messages)} checkpointed messages for this thread.")
    last_message = messages[-1]
    speaker = "Assistant" if isinstance(last_message, AIMessage) else "You"
    print(f"Last message from {speaker}: {last_message.content}")


def print_recent_checkpoints(
    checkpointer: PostgresSaver,
    config: dict,
    limit: int,
) -> None:
    checkpoints = list(checkpointer.list(config, limit=limit))

    if not checkpoints:
        print("No checkpoints stored.")
        return

    print("Recent checkpoints:")
    for checkpoint in checkpoints:
        checkpoint_id = checkpoint.config["configurable"]["checkpoint_id"]
        print(f"- {checkpoint_id}")


def main() -> int:
    load_project_env()
    args = parse_args()
    config = {"configurable": {"thread_id": args.thread_id}}

    print(f"auth_mode={auth_mode()}")
    print(f"db_url={args.db_url}")
    print(f"thread_id={args.thread_id}")
    print(f"region={args.region}")
    print(f"model={args.model}")

    try:
        with PostgresSaver.from_conn_string(args.db_url) as checkpointer:
            checkpointer.setup()
            graph = build_graph(
                region=args.region,
                model=args.model,
                max_tokens=args.max_tokens,
                temperature=args.temperature,
                checkpointer=checkpointer,
            )

            print_existing_context(graph, config)
            print("Session started. Type 'quit' to end.")

            while True:
                question = input("\nYou: ").strip()
                if not question:
                    continue
                if question.lower() == "quit":
                    break

                result = graph.invoke(
                    {"messages": [HumanMessage(content=question)]},
                    config,
                )
                assistant_message = result["messages"][-1]
                print(f"\nAssistant: {assistant_message.content}")

            print()
            print_recent_checkpoints(checkpointer, config, args.history_limit)
    except (ClientError, BotoCoreError) as exc:
        print("Bedrock call failed.", file=sys.stderr)
        print(str(exc), file=sys.stderr)
        return 1
    except Exception as exc:
        print("Session failed.", file=sys.stderr)
        print(str(exc), file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
