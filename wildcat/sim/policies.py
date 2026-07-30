"""Player behaviour: the keep-or-scrap decision at reveal.

The economy's realised numbers depend heavily on what players actually do, so
the simulator runs several archetypes rather than assuming one. Each policy
decides, at the moment of reveal, whether to keep the rig or scrap it — and if
scrapping, whether to take cash (leaves the pool) or credit (stays in the pool).

A policy is a callable: (cfg, rig, expected_value_of_holding) -> Decision.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from .config import GameConfig
from .engine import Rig, scrap_quote


@dataclass
class Decision:
    keep: bool
    take_credit: bool = False   # only meaningful when keep is False


Policy = Callable[[GameConfig, Rig, float], Decision]


def always_keep(cfg: GameConfig, rig: Rig, ev_hold: float) -> Decision:
    return Decision(keep=True)


def always_scrap_cash(cfg: GameConfig, rig: Rig, ev_hold: float) -> Decision:
    return Decision(keep=False, take_credit=False)


def _scrap_below(floor_tier: str, take_credit: bool) -> Policy:
    """Keep this tier or better, scrap everything below it."""

    def policy(cfg: GameConfig, rig: Rig, ev_hold: float) -> Decision:
        floor = cfg.tier_index(floor_tier)
        if rig.tier_index >= floor:
            return Decision(keep=True)
        return Decision(keep=False, take_credit=take_credit)

    return policy


# The intended-design player: scrap the losers, hold the winners, take credit
# so you can immediately re-drill. This is the behaviour the tiered scrap-rate
# asymmetry is engineered to produce.
scrap_losers_credit: Policy = _scrap_below("Producer", take_credit=True)
scrap_losers_cash: Policy = _scrap_below("Producer", take_credit=False)


def rational_reroll(cfg: GameConfig, rig: Rig, ev_hold: float) -> Decision:
    """Scrap-to-credit whenever the credit re-drilled beats holding.

    A rig is worth ``remaining_value`` if held. Scrapping to credit yields
    ``credit``, which buys ``credit / drill_cost`` fresh drills each worth
    ``ev_hold`` in expectation. Re-roll if that expected value exceeds holding.
    Because scrap_rate < 1 and EV < drill_cost, this naturally keeps high tiers
    and scraps low ones — an EV-driven derivation of the same behaviour.
    """
    _, credit = scrap_quote(cfg, rig)
    reroll_ev = (credit / cfg.drill_cost) * ev_hold
    if reroll_ev > rig.remaining_value:
        return Decision(keep=False, take_credit=True)
    return Decision(keep=True)


REGISTRY: dict[str, Policy] = {
    "always_keep": always_keep,
    "always_scrap_cash": always_scrap_cash,
    "scrap_losers_credit": scrap_losers_credit,
    "scrap_losers_cash": scrap_losers_cash,
    "rational_reroll": rational_reroll,
}
