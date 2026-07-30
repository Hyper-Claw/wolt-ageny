"""Economic configuration for the WILDCAT drilling game.

Everything the house edge depends on lives here. The numbers below are the
*placeholders* from CONCEPT v4 — the whole point of the simulator is to sweep
them and find values that hold up. Nothing here is committed to; it's a
starting point that is explicitly meant to be tuned.

Conventions
-----------
* All payout multiples are expressed as a multiple of the drill cost.
  A rig with ``lifetime_multiple = 3.0`` pays out 3x the drill cost over its
  life if held to depletion.
* Probabilities are relative weights; they are normalised at load time, so you
  can write them as odds, percentages, or arbitrary weights.
* ``scrap_rate`` is the fraction of a rig's *remaining* lifetime value paid on
  salvage. It is deliberately below 1.0 — that gap is the second house edge.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List


@dataclass(frozen=True)
class Tier:
    """A single rig tier and everything the economy needs to price it."""

    name: str
    weight: float               # relative probability weight (normalised at load)
    lifetime_multiple: float    # total payout as a multiple of drill cost, if held to depletion
    duration_ticks: int         # how many production ticks the rig streams over
    scrap_rate: float           # fraction of REMAINING value paid on salvage (< 1.0)
    front_load: float = 1.0     # >1 pays faster early; 1.0 is flat. See engine.production_schedule.

    def __post_init__(self) -> None:
        if not 0.0 < self.scrap_rate <= 1.0:
            raise ValueError(f"{self.name}: scrap_rate must be in (0, 1], got {self.scrap_rate}")
        if self.duration_ticks < 1:
            raise ValueError(f"{self.name}: duration_ticks must be >= 1")
        if self.weight < 0:
            raise ValueError(f"{self.name}: weight must be >= 0")


@dataclass
class GameConfig:
    """Full economic configuration for one game variant."""

    drill_cost: float = 100.0
    tiers: List[Tier] = field(default_factory=list)

    # Credit is worth more than cash on scrap — this is the cash->credit uplift.
    # 1.15 means credit is worth 15% more than the cash-scrap number, but is
    # only spendable on drilling (so it never leaves the pool).
    credit_multiplier: float = 1.15

    # Pity timer: after this many consecutive rolls of `pity_floor_tier` or
    # worse, the next roll is guaranteed `pity_floor_tier`-or-better.
    # Set pity_threshold to 0 to disable.
    pity_threshold: int = 12
    pity_floor_tier: str = "Producer"

    # Circuit breaker: if pool coverage falls below `breaker_ratio`, global
    # production is scaled by `breaker_scale` ("field-wide pressure loss").
    breaker_ratio: float = 1.0
    breaker_scale: float = 0.5

    def normalised_weights(self) -> List[float]:
        total = sum(t.weight for t in self.tiers)
        if total <= 0:
            raise ValueError("tier weights sum to zero")
        return [t.weight / total for t in self.tiers]

    def tier_index(self, name: str) -> int:
        for i, t in enumerate(self.tiers):
            if t.name == name:
                return i
        raise KeyError(f"no tier named {name!r}")


def default_config() -> GameConfig:
    """The CONCEPT v4 placeholder table.

    EV of holding everything works out to ~0.86x (a ~14% house edge before the
    scrap edge is layered on). Verified analytically in report.py and asserted
    in the tests.

    ``duration_ticks`` encodes the 'fast and short vs slow and long' open
    question: losers deplete fast, winners stream long. ``front_load`` makes new
    rigs 'visibly pay within minutes' per the short-session goals.
    """
    return GameConfig(
        drill_cost=100.0,
        tiers=[
            #    name          weight  mult   dur  scrap  front
            Tier("Dry Hole",    40.0,  0.30,   6,  0.80,  1.6),
            Tier("Marginal",    35.0,  0.70,  18,  0.70,  1.3),
            Tier("Producer",    18.0,  1.20,  24,  0.55,  1.4),
            Tier("Gusher",       6.0,  3.00,  36,  0.45,  1.5),
            Tier("Legendary",    1.0, 10.00,  60,  0.40,  1.5),
        ],
        credit_multiplier=1.15,
        pity_threshold=12,
        pity_floor_tier="Producer",
        breaker_ratio=1.0,
        breaker_scale=0.5,
    )
