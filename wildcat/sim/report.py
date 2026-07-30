"""Human-readable reports over the analytic and Monte Carlo results."""

from __future__ import annotations

from typing import List

from .config import GameConfig, default_config
from .engine import production_schedule, scrap_quote, mint_rig
from .policies import REGISTRY, Policy
from .simulate import analytic_summary, simulate, shock_arrival, SimResult


RULE = "=" * 60


def _header(text: str) -> List[str]:
    return ["", RULE, text, RULE]


def scrap_edge_table(cfg: GameConfig) -> List[str]:
    """Show the second house edge: the gap between a fresh rig's hold-value and
    its immediate scrap value, per tier."""
    lines = [f"{'Tier':<12}{'hold':>8}{'scrap$':>9}{'credit':>9}{'edge':>8}"]
    for i, t in enumerate(cfg.tiers):
        rig = mint_rig(cfg, i)
        hold = rig.remaining_value
        cash, credit = scrap_quote(cfg, rig)
        edge = 1.0 - cash / hold if hold else 0.0
        lines.append(
            f"{t.name:<12}{hold:>8.1f}{cash:>9.1f}{credit:>9.1f}{edge*100:>7.1f}%"
        )
    return lines


def run_report(
    cfg: GameConfig | None = None,
    *,
    ticks: int = 40_000,
    drills_per_tick: float = 1.0,
    seed_capital: float = 0.0,
    seed: int = 0,
    policies: List[str] | None = None,
) -> str:
    cfg = cfg or default_config()
    policies = policies or list(REGISTRY.keys())

    out: List[str] = []
    out += _header("WILDCAT — economic simulation")
    out.append(f"drill cost: {cfg.drill_cost:.0f}   "
               f"pity: {cfg.pity_threshold} rolls -> {cfg.pity_floor_tier}   "
               f"breaker: <{cfg.breaker_ratio:.2f} => x{cfg.breaker_scale:.2f}")

    out += _header("1. Analytic house edge (hold to depletion)")
    out += analytic_summary(cfg).as_lines()

    out += _header("2. Scrap edge (fresh-rig salvage vs hold value)")
    out += scrap_edge_table(cfg)

    out += _header(f"3. Pool solvency by player behaviour "
                   f"({ticks:,} ticks, seed_capital={seed_capital:.0f})")
    for name in policies:
        policy: Policy = REGISTRY[name]
        res: SimResult = simulate(
            cfg, policy,
            ticks=ticks, drills_per_tick=drills_per_tick,
            seed_capital=seed_capital, seed=seed,
        )
        out.append("")
        out.append(f"--- policy: {name} ---")
        out += ["  " + ln for ln in res.as_lines()]

    out += _header("4. Demand shock (inflow stops at the halfway point)")
    out.append("Worst case: everyone drills, then stops. Streaming liabilities")
    out.append("keep draining with no fresh USDC. 'Peak buffer required' is the")
    out.append("USO the house must hold to survive the wind-down.")
    stop = ticks // 2
    for name in policies:
        res = simulate(
            cfg, REGISTRY[name],
            ticks=ticks, arrival=shock_arrival(drills_per_tick, stop),
            seed_capital=seed_capital, seed=seed,
        )
        out.append("")
        out.append(f"--- policy: {name} (shock @ tick {stop:,}) ---")
        out += ["  " + ln for ln in res.as_lines()]

    out.append("")
    return "\n".join(out)


if __name__ == "__main__":  # pragma: no cover
    print(run_report())
