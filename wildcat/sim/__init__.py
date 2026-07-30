"""WILDCAT economic simulator.

Build-order step 1 from CONCEPT v4: nail the odds table, house edge, pool
coverage over time, worst-case tail runs, and scrap behaviour before anything
else gets built.
"""

from .config import GameConfig, Tier, default_config
from .engine import Rig, Roller, mint_rig, production_schedule, scrap_quote
from .policies import REGISTRY, Decision
from .simulate import (
    AnalyticSummary,
    SimResult,
    analytic_summary,
    expected_hold_value,
    simulate,
)
from .report import run_report

__all__ = [
    "GameConfig",
    "Tier",
    "default_config",
    "Rig",
    "Roller",
    "mint_rig",
    "production_schedule",
    "scrap_quote",
    "REGISTRY",
    "Decision",
    "AnalyticSummary",
    "SimResult",
    "analytic_summary",
    "expected_hold_value",
    "simulate",
    "run_report",
]
