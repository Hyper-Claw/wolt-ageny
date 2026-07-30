"""Core mechanics: rolling a rig, streaming production, valuing a scrap.

Pure and deterministic given a seeded ``random.Random``. No pool state lives
here — this layer only knows how a single rig behaves. Pool accounting and
player behaviour sit in simulate.py and policies.py.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List

import random

from .config import GameConfig, Tier


def production_schedule(tier: Tier, drill_cost: float) -> List[float]:
    """Per-tick payout amounts for a freshly minted rig, summing to lifetime value.

    ``front_load`` tilts payouts toward the start using linearly decaying
    weights, so a new rig 'visibly pays within minutes' without changing the
    lifetime total. front_load == 1.0 is a flat stream.
    """
    n = tier.duration_ticks
    lifetime_value = drill_cost * tier.lifetime_multiple

    if tier.front_load == 1.0 or n == 1:
        return [lifetime_value / n] * n

    # Weight tick i (0-indexed) as a line from `front_load` down to 1.0.
    weights = [tier.front_load - (tier.front_load - 1.0) * (i / (n - 1)) for i in range(n)]
    total = sum(weights)
    return [lifetime_value * w / total for w in weights]


@dataclass
class Rig:
    """A live rig on the field."""

    tier_index: int
    schedule: List[float]        # remaining per-tick payouts, index 0 = next tick
    paid_out: float = 0.0        # cumulative streamed so far
    ticks_elapsed: int = 0

    @property
    def remaining_value(self) -> float:
        return sum(self.schedule)

    @property
    def depleted(self) -> bool:
        return not self.schedule

    def produce_one_tick(self, scale: float = 1.0) -> float:
        """Stream the next tick's payout, optionally throttled by the breaker.

        Throttling stretches the well (the un-produced remainder stays owed) —
        it lowers the rate, not the lifetime total.
        """
        if self.depleted:
            return 0.0
        due = self.schedule[0] * scale
        remainder = self.schedule[0] - due
        self.schedule.pop(0)
        if remainder > 1e-12:
            # push throttled remainder onto the next tick so nothing is lost
            if self.schedule:
                self.schedule[0] += remainder
            else:
                self.schedule.append(remainder)
        self.paid_out += due
        self.ticks_elapsed += 1
        return due


class Roller:
    """Rolls tiers with an optional pity timer.

    The pity timer counts consecutive rolls strictly below the floor tier; once
    it hits the threshold, the next roll is drawn only from floor-or-better
    tiers (re-weighted by their relative odds). This is standard gacha pity and
    materially improves early-session feel.
    """

    def __init__(self, cfg: GameConfig, rng: random.Random):
        self.cfg = cfg
        self.rng = rng
        self.weights = cfg.normalised_weights()
        self.floor_index = cfg.tier_index(cfg.pity_floor_tier)
        self._bad_streak = 0

    def _weighted_choice(self, indices: List[int]) -> int:
        w = [self.weights[i] for i in indices]
        total = sum(w)
        r = self.rng.random() * total
        acc = 0.0
        for i, wi in zip(indices, w):
            acc += wi
            if r <= acc:
                return i
        return indices[-1]

    def roll(self) -> int:
        pity_active = (
            self.cfg.pity_threshold > 0 and self._bad_streak >= self.cfg.pity_threshold
        )
        if pity_active:
            eligible = [i for i in range(len(self.cfg.tiers)) if i >= self.floor_index]
            idx = self._weighted_choice(eligible)
        else:
            idx = self._weighted_choice(list(range(len(self.cfg.tiers))))

        if idx < self.floor_index:
            self._bad_streak += 1
        else:
            self._bad_streak = 0
        return idx


def mint_rig(cfg: GameConfig, tier_index: int) -> Rig:
    tier = cfg.tiers[tier_index]
    return Rig(tier_index=tier_index, schedule=production_schedule(tier, cfg.drill_cost))


def scrap_quote(cfg: GameConfig, rig: Rig) -> tuple[float, float]:
    """Return (cash_value, credit_value) for scrapping ``rig`` right now.

    Scrap pays ``scrap_rate`` of the rig's *remaining* value — so as the well
    depletes, the salvage number falls. That is the no-dark-pattern urgency:
    value decays with production instead of a countdown timer. Credit is the
    cash number scaled up by ``credit_multiplier`` (worth more, pool-locked).
    """
    tier = cfg.tiers[rig.tier_index]
    cash = rig.remaining_value * tier.scrap_rate
    credit = cash * cfg.credit_multiplier
    return cash, credit
