from functools import lru_cache
from pathlib import Path
from string import Template

PROMPT_DIR = Path(__file__).resolve().parents[2] / "prompts"


@lru_cache(maxsize=None)
def _load_prompt_text(name: str) -> str:
    return (PROMPT_DIR / name).read_text(encoding="utf-8")


def render_prompt(name: str, **values: object) -> str:
    return Template(_load_prompt_text(name)).safe_substitute(**values)
