"""CLI: ``python -m wildcat.sim`` runs the full economic report.

Flags let you sweep the open questions from CONCEPT v4 without editing code.
"""

from __future__ import annotations

import argparse

from .config import default_config
from .report import run_report


def main() -> None:
    p = argparse.ArgumentParser(description="WILDCAT economic simulation")
    p.add_argument("--ticks", type=int, default=40_000)
    p.add_argument("--drills-per-tick", type=float, default=1.0)
    p.add_argument("--seed-capital", type=float, default=0.0,
                   help="house USO buffer at t=0 (0 => self-funding test)")
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--drill-cost", type=float, default=None)
    p.add_argument("--pity", type=int, default=None, help="pity threshold; 0 disables")
    p.add_argument("--policy", action="append", default=None,
                   help="restrict to named policies (repeatable)")
    args = p.parse_args()

    cfg = default_config()
    if args.drill_cost is not None:
        cfg.drill_cost = args.drill_cost
    if args.pity is not None:
        cfg.pity_threshold = args.pity

    print(run_report(
        cfg,
        ticks=args.ticks,
        drills_per_tick=args.drills_per_tick,
        seed_capital=args.seed_capital,
        seed=args.seed,
        policies=args.policy,
    ))


if __name__ == "__main__":
    main()
