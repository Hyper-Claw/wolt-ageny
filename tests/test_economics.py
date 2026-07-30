"""Invariant tests for the WILDCAT economy.

These pin the properties the design *depends on*. If a config change breaks one,
the design broke, not the test.
"""

import math

from wildcat.sim import (
    default_config,
    analytic_summary,
    expected_hold_value,
    mint_rig,
    scrap_quote,
    production_schedule,
    simulate,
    REGISTRY,
)
from wildcat.sim.simulate import shock_arrival


def test_analytic_house_edge_is_positive():
    """The whole thing only works if EV of holding is below the drill cost."""
    s = analytic_summary(default_config())
    assert s.rtp_hold < 1.0, "hold RTP must be below 1.0 or the house loses"
    assert 0.10 < s.house_edge_hold < 0.20, s.house_edge_hold


def test_analytic_matches_hand_computation():
    cfg = default_config()
    s = analytic_summary(cfg)
    expected = 0.40*0.30 + 0.35*0.70 + 0.18*1.20 + 0.06*3.00 + 0.01*10.00
    assert math.isclose(s.rtp_hold, expected, rel_tol=1e-9)


def test_production_schedule_sums_to_lifetime_value():
    cfg = default_config()
    for i, t in enumerate(cfg.tiers):
        sched = production_schedule(t, cfg.drill_cost)
        assert math.isclose(sum(sched), cfg.drill_cost * t.lifetime_multiple, rel_tol=1e-9)
        assert len(sched) == t.duration_ticks


def test_front_load_pays_more_early():
    cfg = default_config()
    gusher = cfg.tiers[cfg.tier_index("Gusher")]
    sched = production_schedule(gusher, cfg.drill_cost)
    assert sched[0] > sched[-1], "front-loaded rig should pay more in its first tick"


def test_scrap_always_below_hold_value():
    """The scrap discount (second house edge) must hold for every tier: cash
    scrap < hold value. Credit is worth more but stays pool-locked."""
    cfg = default_config()
    for i, t in enumerate(cfg.tiers):
        rig = mint_rig(cfg, i)
        cash, credit = scrap_quote(cfg, rig)
        assert cash < rig.remaining_value, f"{t.name}: cash scrap must be < hold"
        assert credit > cash, f"{t.name}: credit must beat cash"


def test_scrap_value_decays_as_rig_produces():
    cfg = default_config()
    rig = mint_rig(cfg, cfg.tier_index("Producer"))
    cash0, _ = scrap_quote(cfg, rig)
    rig.produce_one_tick()
    rig.produce_one_tick()
    cash1, _ = scrap_quote(cfg, rig)
    assert cash1 < cash0, "a depleted well must salvage for less"


def test_higher_tiers_are_harder_to_scrap_profitably():
    """Scrap rate must decrease up the tiers, so losers scrap and winners hold."""
    cfg = default_config()
    rates = [t.scrap_rate for t in cfg.tiers]
    assert rates == sorted(rates, reverse=True), "scrap rate must fall as tier rises"


def test_pool_stays_solvent_with_reasonable_seed():
    """With a modest seed buffer, no player behaviour should exhaust the pool
    over a long run — realised RTP must stay under 1.0 for every archetype."""
    cfg = default_config()
    for name, policy in REGISTRY.items():
        res = simulate(cfg, policy, ticks=20_000, seed_capital=50_000, seed=1)
        assert res.realised_rtp < 1.0, f"{name}: house lost money (RTP {res.realised_rtp})"
        assert res.min_pool > -1e9, f"{name}: unbounded drawdown"


def test_credit_recirculation_is_convergent():
    """Credit policies create extra drills but must not compound without bound:
    credit drills stay a bounded fraction of fresh drills."""
    cfg = default_config()
    res = simulate(cfg, REGISTRY["scrap_losers_credit"], ticks=20_000, seed=2)
    assert res.credit_drills > 0, "this policy should generate credit re-drills"
    assert res.credit_drills < res.fresh_drills, "credit must not exceed fresh volume"


def test_realised_edge_at_least_analytic_when_scrapping():
    """Any scrapping behaviour hands the house AT LEAST the hold edge, usually
    more (the scrap discount stacks on top)."""
    cfg = default_config()
    hold_edge = analytic_summary(cfg).house_edge_hold
    res = simulate(cfg, REGISTRY["scrap_losers_cash"], ticks=30_000, seed=3)
    realised_edge = 1.0 - res.realised_rtp
    assert realised_edge >= hold_edge - 0.02, (realised_edge, hold_edge)


def test_survives_demand_shock():
    """Inflow stops halfway; the accumulated house edge must cover the tail of
    streaming liabilities. The pool should never need external rescue."""
    cfg = default_config()
    for name, policy in REGISTRY.items():
        res = simulate(
            cfg, policy,
            ticks=30_000, arrival=shock_arrival(1.0, 15_000),
            seed_capital=0.0, seed=7,
        )
        assert res.final_pool >= 0, f"{name}: pool went negative after shock"


def test_expected_hold_value_is_currency():
    cfg = default_config()
    assert math.isclose(
        expected_hold_value(cfg),
        analytic_summary(cfg).rtp_hold * cfg.drill_cost,
        rel_tol=1e-9,
    )
