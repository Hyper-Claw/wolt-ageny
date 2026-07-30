"""Analytic economics and the Monte Carlo pool simulation.

Two independent views on the same config:

* ``analytic_summary`` — exact, closed-form house edge / RTP per tier. Instant,
  no randomness. This is the sanity check the concept doc demands before
  anything else gets built.
* ``simulate`` — a time-stepped Monte Carlo of a player population sharing one
  pool, with pity timer, scrap behaviour, and the solvency circuit breaker.
  This is what surfaces pool-coverage-over-time and worst-case tail runs.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

import random

from .config import GameConfig
from .engine import Rig, Roller, mint_rig, scrap_quote
from .policies import Policy


# --------------------------------------------------------------------------- #
# Analytic
# --------------------------------------------------------------------------- #

@dataclass
class TierStats:
    name: str
    probability: float
    lifetime_multiple: float
    contribution: float          # probability * lifetime_multiple


@dataclass
class AnalyticSummary:
    rtp_hold: float              # expected return if every rig is held to depletion
    house_edge_hold: float       # 1 - rtp_hold
    tiers: List[TierStats]

    def as_lines(self) -> List[str]:
        out = [
            f"Hold-everything RTP : {self.rtp_hold:6.3f}x",
            f"House edge (hold)   : {self.house_edge_hold*100:6.2f}%",
            "",
            f"{'Tier':<12}{'P':>8}{'mult':>8}{'P*mult':>10}",
        ]
        for t in self.tiers:
            out.append(
                f"{t.name:<12}{t.probability:>8.4f}{t.lifetime_multiple:>8.2f}{t.contribution:>10.4f}"
            )
        return out


def analytic_summary(cfg: GameConfig) -> AnalyticSummary:
    """Exact RTP if players hold to depletion. Ignores the scrap edge, which
    only ever *increases* the house's take, so this is the RTP ceiling."""
    probs = cfg.normalised_weights()
    tiers = [
        TierStats(t.name, p, t.lifetime_multiple, p * t.lifetime_multiple)
        for t, p in zip(cfg.tiers, probs)
    ]
    rtp = sum(t.contribution for t in tiers)
    return AnalyticSummary(rtp_hold=rtp, house_edge_hold=1.0 - rtp, tiers=tiers)


def expected_hold_value(cfg: GameConfig) -> float:
    """EV of a single drill in currency, holding to depletion."""
    return analytic_summary(cfg).rtp_hold * cfg.drill_cost


# --------------------------------------------------------------------------- #
# Monte Carlo pool simulation
# --------------------------------------------------------------------------- #

@dataclass
class SimResult:
    ticks: int
    total_drills: int                # every roll, including credit-funded re-drills
    fresh_drills: int                # drills funded by new USDC deposits
    credit_drills: int               # drills funded by recirculated scrap credit
    total_wagered: float             # FRESH USDC in only — the solvency denominator
    total_paid_cash: float           # USO that actually left the pool (payouts + cash scraps)
    seed_capital: float

    final_pool: float
    min_pool: float
    min_coverage: float              # worst pool / liabilities ratio seen
    breaker_trips: int

    realised_rtp: float              # cash out / fresh wagered (house's realised give-back)
    tier_counts: Dict[str, int] = field(default_factory=dict)

    longest_gap_legendary: int = 0   # most drills between two Legendary hits
    max_legendary_cluster: int = 0   # most Legendaries in any 100-drill window
    pool_curve: List[float] = field(default_factory=list)      # sampled pool balance
    coverage_curve: List[float] = field(default_factory=list)  # sampled coverage ratio

    def as_lines(self) -> List[str]:
        # The pool is seeded with `seed_capital`; the deepest it dips below the
        # seed line is the extra buffer the house must front to never starve.
        drawdown = max(0.0, self.seed_capital - self.min_pool)
        cov = "  n/a  " if self.min_coverage < 0 else f"{self.min_coverage:6.3f}"
        return [
            f"Ticks simulated      : {self.ticks:,}",
            f"Total drills         : {self.total_drills:,}  "
            f"({self.fresh_drills:,} fresh + {self.credit_drills:,} credit)",
            f"Total wagered (fresh): {self.total_wagered:,.0f}",
            f"Cash paid out        : {self.total_paid_cash:,.0f}",
            f"Realised RTP         : {self.realised_rtp:6.3f}x  "
            f"(house keeps {(1-self.realised_rtp)*100:5.2f}%)",
            f"Seed capital         : {self.seed_capital:,.0f}",
            f"Final pool balance   : {self.final_pool:,.0f}",
            f"Peak buffer required : {drawdown:,.0f}   "
            f"(min pool {self.min_pool:,.0f})",
            f"Min coverage ratio   : {cov}",
            f"Breaker trips        : {self.breaker_trips:,}",
            f"Longest Legendary gap: {self.longest_gap_legendary:,} drills",
            f"Max Legendary/100    : {self.max_legendary_cluster}",
        ]


def _outstanding_liability(rigs: List[Rig]) -> float:
    return sum(r.remaining_value for r in rigs)


def constant_arrival(rate: float):
    """Arrival schedule: a fixed number of fresh drills every tick."""
    return lambda tick: rate


def shock_arrival(rate: float, stop_tick: int):
    """Demand shock: `rate` drills/tick until `stop_tick`, then zero fresh
    inflow while streaming liabilities keep draining the pool. The worst case
    the pool can face."""
    return lambda tick: rate if tick < stop_tick else 0.0


def simulate(
    cfg: GameConfig,
    policy: Policy,
    *,
    ticks: int = 20_000,
    drills_per_tick: float = 1.0,
    arrival=None,
    seed_capital: float = 0.0,
    seed: int = 0,
    sample_every: int = 100,
) -> SimResult:
    """Step a shared-pool economy forward ``ticks`` ticks.

    Each tick: some number of new drills arrive (each pays ``drill_cost`` in,
    rolls a tier, and the player applies ``policy`` to keep or scrap), then
    every live kept rig streams one tick of production. The circuit breaker
    throttles production whenever coverage dips below the configured ratio.

    ``seed_capital`` models a house-provided USO buffer. With 0 the sim shows
    whether the design is self-funding from wagers alone.
    """
    rng = random.Random(seed)
    roller = Roller(cfg, rng)
    ev_hold = expected_hold_value(cfg)
    legendary_index = cfg.tier_index("Legendary")
    if arrival is None:
        arrival = constant_arrival(drills_per_tick)

    pool = seed_capital
    live: List[Rig] = []
    credit_balance = 0.0             # internal scrip: pool-locked, funds re-drills

    total_drills = 0
    fresh_drills = 0
    credit_drills = 0
    total_wagered = 0.0
    total_paid_cash = 0.0
    breaker_trips = 0
    min_pool = pool
    min_coverage = float("inf")
    tier_counts: Dict[str, int] = {t.name: 0 for t in cfg.tiers}

    # Legendary tail tracking
    drills_since_legendary = 0
    longest_gap = 0
    legendary_hits: List[int] = []   # drill indices
    max_cluster = 0

    pool_curve: List[float] = []
    coverage_curve: List[float] = []

    # fractional drill accumulator so drills_per_tick can be non-integer
    drill_accumulator = 0.0

    def do_drill(from_credit: bool) -> None:
        """One drill: stake in, roll, then keep or scrap per policy."""
        nonlocal pool, credit_balance, total_drills, fresh_drills, credit_drills
        nonlocal total_wagered, total_paid_cash, drills_since_legendary, longest_gap, max_cluster

        if from_credit:
            credit_balance -= cfg.drill_cost   # scrip covers the stake; no cash in
            credit_drills += 1
        else:
            pool += cfg.drill_cost             # fresh USDC deposit
            total_wagered += cfg.drill_cost
            fresh_drills += 1
        total_drills += 1

        idx = roller.roll()
        tier_counts[cfg.tiers[idx].name] += 1

        if idx == legendary_index:
            longest_gap = max(longest_gap, drills_since_legendary)
            drills_since_legendary = 0
            legendary_hits.append(total_drills)
        else:
            drills_since_legendary += 1

        rig = mint_rig(cfg, idx)
        decision = policy(cfg, rig, ev_hold)

        if decision.keep:
            live.append(rig)
        else:
            cash, credit = scrap_quote(cfg, rig)
            if decision.take_credit:
                # Salvage honoured in scrip: the money stays in the pool and
                # buys future drills that bring NO fresh cash in. This is the
                # true test of credit — it manufactures liabilities without
                # deposits, and only the house edge keeps it convergent.
                credit_balance += credit
            else:
                # Pay the cash scrap. We let the pool dip below zero rather than
                # clamp: the deepest drawdown IS the seed buffer the house must
                # hold so payouts never starve. |min_pool| answers "how big a
                # USO buffer do we need?"
                pool -= cash
                total_paid_cash += cash

    for tick in range(ticks):
        # --- arrivals: fresh drills funded by new USDC ---
        drill_accumulator += arrival(tick)
        n_new = int(drill_accumulator)
        drill_accumulator -= n_new
        for _ in range(n_new):
            do_drill(from_credit=False)

        # --- recirculation: spend accumulated credit on re-drills ---
        # Bounded per tick by the credit on hand; credit only shrinks in
        # expectation (house edge), so this converges rather than compounds.
        while credit_balance >= cfg.drill_cost:
            do_drill(from_credit=True)

        # --- production: coverage check drives the breaker ---
        liability = _outstanding_liability(live)
        coverage = (pool / liability) if liability > 1e-9 else float("inf")
        scale = 1.0
        if cfg.breaker_ratio > 0 and coverage < cfg.breaker_ratio:
            scale = cfg.breaker_scale
            breaker_trips += 1
        if coverage < min_coverage:
            min_coverage = coverage

        for rig in live:
            pay = rig.produce_one_tick(scale)
            pool -= pay                          # may dip negative — see note above
            total_paid_cash += pay

        live = [r for r in live if not r.depleted]

        if pool < min_pool:
            min_pool = pool

        # Legendary clustering: hits within the last 100 drills
        if legendary_hits:
            window_lo = total_drills - 100
            cluster = sum(1 for h in legendary_hits if h > window_lo)
            max_cluster = max(max_cluster, cluster)

        if tick % sample_every == 0:
            pool_curve.append(pool)
            coverage_curve.append(coverage if coverage != float("inf") else -1.0)

    # tail of run
    longest_gap = max(longest_gap, drills_since_legendary)
    realised_rtp = (total_paid_cash / total_wagered) if total_wagered else 0.0
    if min_coverage == float("inf"):
        min_coverage = -1.0  # never had a liability to cover

    return SimResult(
        ticks=ticks,
        total_drills=total_drills,
        fresh_drills=fresh_drills,
        credit_drills=credit_drills,
        total_wagered=total_wagered,
        total_paid_cash=total_paid_cash,
        seed_capital=seed_capital,
        final_pool=pool,
        min_pool=min_pool,
        min_coverage=min_coverage,
        breaker_trips=breaker_trips,
        realised_rtp=realised_rtp,
        tier_counts=tier_counts,
        longest_gap_legendary=longest_gap,
        max_legendary_cluster=max_cluster,
        pool_curve=pool_curve,
        coverage_curve=coverage_curve,
    )
