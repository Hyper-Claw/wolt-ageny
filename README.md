# WILDCAT

Gacha drilling game. USDC in, real oil out. See [`CONCEPT.md`](CONCEPT.md) for
the full design.

This repo currently holds **build-order step 1: the economic simulator** — the
piece the concept says must be right before anything else gets built:

> **Simulate the odds table** — house edge, pool coverage over time, worst case
> run of Legendary hits, and scrap-rate behavior under different player mixes.
> Nothing else until this is right.

## Run it

No dependencies (stdlib only). From the repo root:

```bash
python3 -m wildcat.sim                 # full report on the default (concept) table
python3 -m wildcat.sim --ticks 100000  # longer run
python3 -m wildcat.sim --seed-capital 50000 --pity 8
python3 -m wildcat.sim --policy always_keep --policy scrap_losers_credit
```

Tests (needs `pytest`):

```bash
python3 -m pytest tests/ -q
```

## What it models

| Piece | Where | Notes |
|---|---|---|
| Odds table, payouts, scrap rates | `wildcat/sim/config.py` | The concept placeholders; tune freely |
| Roll + pity timer | `wildcat/sim/engine.py` `Roller` | Guaranteed Producer+ after N bad rolls |
| Production stream + front-loading | `engine.production_schedule` | New rigs visibly pay early |
| Scrap valuation + decay | `engine.scrap_quote` | Salvage falls as the well depletes |
| Player behaviour | `wildcat/sim/policies.py` | keep / scrap-cash / scrap-credit / EV-rational |
| Shared pool, credit recirculation, breaker | `wildcat/sim/simulate.py` | Solvency over time; demand-shock scenario |

The report has four sections: **(1)** analytic house edge, **(2)** the scrap
edge per tier, **(3)** pool solvency under each player archetype, **(4)** a
demand-shock stress test.

## What the default table says

Numbers below are from the concept's placeholder table (`default_config()`).
The point of the tool is to change them and re-run.

**House edge is real and structural.**
- Hold-to-depletion RTP ≈ **0.861x** → a **~13.9% house edge** before scrap.
- Every scrapping archetype hands the house *more*: cash-scrappers realise a
  ~23% edge, credit-scrappers ~28%. Scrap is a second edge exactly as designed.

**The pool is self-funding.** With zero seed capital, no player archetype
drains it — each drill's stake (100) exceeds expected payout (~86), so the edge
accrues faster than liabilities stream out. Coverage dips to ~0.83 at worst
(the circuit breaker fires there); it never goes insolvent.

**It survives a demand shock.** If all drilling stops halfway through, the
accumulated edge covers the tail of streaming payouts. Peak external buffer
required: **0**. The house edge *is* the buffer.

**Credit recirculation converges.** Under the default table, scrapped-to-credit
value shrinks ~40%+ each cycle, so credit re-drills stay a bounded fraction of
fresh volume — the money stays in the pool without compounding into a liability
spiral.

**A finding worth flagging:** under these params, scrapping-to-reroll is *never*
EV-positive for the player (`rational_reroll` chooses to keep everything — it's
identical to `always_keep` in the report). Scrap works because players are
impatient and want to re-roll losers, not because the math favours it. If you
want scrap taken up by rational players too, the cash/credit spread has to be
more generous — the simulator is where you'd dial that in.

## Mapping to the concept's open questions

| Open question | Where to explore |
|---|---|
| Odds table & house-edge sizing | `config.py` tiers; section 1 of the report |
| Scrap rates per tier & decay curve | `Tier.scrap_rate`; section 2; `scrap_quote` |
| Cash-vs-credit spread | `GameConfig.credit_multiplier`; watch `rational_reroll` uptake |
| Drill cost — single or tiered | `--drill-cost`; the model is stake-agnostic |
| Pity threshold | `--pity`; `GameConfig.pity_threshold` |
| Payout duration per tier | `Tier.duration_ticks` / `front_load` |

## Not yet built (later build-order steps)

VRF verification, USDC→USO conversion/slippage, the deposit+roll contract, rig
accrual/scrap contracts, and the reveal UI. The concept is clear that step 1
comes first — this is that.
