"""Configuration and cue repo / skills discovery.

Adapted from hermes-agent-self-evolution's EvolutionConfig. Key cue-specific
changes:
  * skills live under <cue-repo>/resources/skills/skills/<category>/<slug>/SKILL.md
  * the constraint gate is `cue lint-skill <path> --json` (CueEvolutionConfig.lint_cmd)
  * models are NOT hardcoded to OpenAI — cue is a Claude shop, so the default
    LM string is read from env (CUE_EVOLVE_*_MODEL), falling back to a Claude
    model. DSPy/LiteLLM resolves the provider from the string prefix.
"""

import os
import shutil
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional


# Default models. Overridable via env so no provider is baked in.
#   CUE_EVOLVE_OPTIMIZER_MODEL — model GEPA uses to reflect/mutate the skill
#   CUE_EVOLVE_EVAL_MODEL       — model used for LLM-as-judge + dataset gen
# DSPy/LiteLLM picks the provider from the string prefix
# ("anthropic/...", "openai/...", "openrouter/...", etc.).
_DEFAULT_OPTIMIZER_MODEL = os.getenv(
    "CUE_EVOLVE_OPTIMIZER_MODEL", "anthropic/claude-sonnet-4-5"
)
_DEFAULT_EVAL_MODEL = os.getenv(
    "CUE_EVOLVE_EVAL_MODEL", "anthropic/claude-haiku-4-5"
)


@dataclass
class CueEvolutionConfig:
    """Configuration for a cue skill-content evolution run."""

    # cue repo root + the skills tree inside it.
    cue_repo_path: Path = field(default_factory=lambda: get_cue_repo_path())

    # Optimization parameters
    iterations: int = 10
    population_size: int = 5

    # LLM configuration (provider inferred from the string prefix by LiteLLM)
    optimizer_model: str = _DEFAULT_OPTIMIZER_MODEL
    eval_model: str = _DEFAULT_EVAL_MODEL
    judge_model: str = _DEFAULT_OPTIMIZER_MODEL  # dataset generation

    # Constraints — mirror hermes defaults; the real gate is `cue lint-skill`.
    max_skill_size: int = 15_000  # 15KB
    max_prompt_growth: float = 0.2  # 20% max growth over baseline

    # The auto-apply gate. `{path}` is substituted with the candidate SKILL.md.
    # Overridable for tests / non-PATH installs via CUE_LINT_CMD.
    lint_cmd: str = field(
        default_factory=lambda: os.getenv("CUE_LINT_CMD", "cue lint-skill {path} --json")
    )

    # Eval dataset
    eval_dataset_size: int = 20
    train_ratio: float = 0.5
    val_ratio: float = 0.25
    holdout_ratio: float = 0.25

    def __post_init__(self):
        # The lint gate template must carry the {path} placeholder, else it
        # would lint nothing (or stdin) and the gate becomes meaningless.
        if "{path}" not in self.lint_cmd:
            raise ValueError(
                f"lint_cmd / CUE_LINT_CMD must contain the {{path}} placeholder: {self.lint_cmd!r}"
            )

    @property
    def skills_root(self) -> Path:
        return self.cue_repo_path / "resources" / "skills" / "skills"

    @property
    def evolution_log(self) -> Path:
        """Reuse the same log `cue evolve` writes (~/.config/cue/evolution-log.jsonl)."""
        cfg = Path(os.getenv("XDG_CONFIG_HOME", str(Path.home() / ".config"))) / "cue"
        return cfg / "evolution-log.jsonl"


def get_cue_repo_path() -> Path:
    """Discover the cue repo root.

    Priority:
    1. CUE_REPO env var
    2. Walk up from this file looking for the resources/skills/skills tree
       (this package is vendored at <cue-repo>/evolution/).
    3. ~/Documents/cue (known checkout on this machine)
    """
    env_path = os.getenv("CUE_REPO")
    if env_path:
        p = Path(env_path).expanduser()
        if (p / "resources" / "skills" / "skills").exists():
            return p

    # This file: <cue-repo>/evolution/evolution/core/config.py → repo is 3 up.
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "resources" / "skills" / "skills").exists():
            return parent

    fallback = Path.home() / "Documents" / "cue"
    if (fallback / "resources" / "skills" / "skills").exists():
        return fallback

    raise FileNotFoundError(
        "Cannot find the cue repo. Set CUE_REPO env var to your cue checkout "
        "(the dir containing resources/skills/skills/)."
    )
