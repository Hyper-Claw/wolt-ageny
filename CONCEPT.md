# WILDCAT — Concept v4

Gacha drilling game. USDC in, real oil out. Short sessions, fast loop.

Changes from v3: **secondary market removed**, **scrap mechanic added**.

---

## The loop

**Drill** — pay USDC. This is the bet.

**Reveal** — verifiable random roll determines your rig. This moment is the
product.

**Keep or Scrap** — hold it and let it produce, or salvage it for instant
credit and drill again.

**Produce** — kept rigs stream USO continuously until depleted.

---

## Money flow

Deposits in **USDC**. Payouts in **USO**.

- USDC means no permissioned assets on the deposit side and zero onboarding
  friction
- The contract batch-converts to USO every few minutes rather than per-claim,
  which kills slippage on a thin market
- Hold a working USO buffer so payouts never wait on a swap
- If the USO market gets too thin, fall back to paying USDC denominated as
  barrels — nothing else in the design changes

---

## Rig tiers

Every drill returns something. Nothing returns zero.

| Tier | Rough odds | Lifetime payout | Feel |
|---|---|---|---|
| **Dry Hole** | Common | ~0.3x, fast | Salvage. Stings, doesn't kill. |
| **Marginal** | Common | ~0.7x, slow | Almost. Roll again. |
| **Producer** | Uncommon | ~1.2x | You're up. |
| **Gusher** | Rare | ~3x | Screenshot moment. |
| **Legendary** | Very rare | ~10x+ | What everyone's actually chasing. |

Placeholders — simulate before committing. The shape is what matters: most
rolls lose a little, a few win big, expected value sits below 1.0 by the house
edge.

Publish the table. Odds, payouts, house edge — on-chain and on the site before
launch. Players reverse-engineer it in a day regardless, and being the project
that said it first is worth more than the secret.

---

## Scrap — the new core mechanic

Salvage a rig for immediate credit instead of waiting for it to produce.

### The rule that makes it work

**Scrap always pays less than holding is worth.** That gap is a second house
edge, and it's the best revenue line in the design — it converts a future
streaming liability into a smaller immediate settlement and shortens your
payout duration at the same time.

### Tiered discount

Scrap rate as a percentage of the rig's remaining lifetime value:

| Tier | Scrap rate |
|---|---|
| Dry Hole | ~80% |
| Marginal | ~70% |
| Producer | ~55% |
| Gusher | ~45% |
| Legendary | ~40% |

The asymmetry is deliberate. Scrapping a Dry Hole is obviously correct.
Scrapping a Gusher is obviously a mistake. Losers re-roll immediately, winners
hold and collect. Exactly the behavior you want from both.

### Cash or credit

Offer both on every scrap:

- **Cash** — paid out in USO, leaves the system
- **Credit** — worth meaningfully more, spendable only on drilling

Most players take the credit. The money never leaves the pool, and it's an
honest, visible tradeoff rather than a hidden restriction. Show both numbers
side by side.

### Timing

No forced decision, no countdown. Scrap is available any time — but **scrap
value decays as the rig produces**, because a depleted well has less salvage.

This creates real urgency without a dark-pattern timer, and it's thematically
correct. Scrap early or commit.

### Why this replaces the secondary market

Scrap is the exit. That means rigs can be **non-transferable at launch**, which
deletes:

- The marketplace contracts
- Royalty logic
- Listing and settlement UI
- An entire category of wash-trading and approval exploits

Significantly less to build, and rig supply never overhangs the game.

---

## Making the short session land

- **First drill discounted or free.** Get them to the reveal fast.
- **Front-loaded production.** New rigs visibly pay within minutes.
- **The reveal is the product.** Drilling animation, pressure gauge climbing,
  the gusher blowing. Spend real time here — it's what gets posted.
- **Pity timer.** After N bad rolls, the next is guaranteed Producer or better.
  Standard gacha, huge improvement to early feel, costs little.
- **One-tap re-drill**, and one-tap scrap-and-redrill. Never make them navigate.
- **Session line.** A quiet "today: 14 drills, net −$220" in the corner. Costs
  nothing, keeps it feeling like a game rather than a blur.

---

## Sinks for players who stay

- **Merge** — combine two rigs into one of the next tier up. Gives duplicates a
  purpose, second path to Legendary.
- **Workover** — extend a rig's lifetime payout cap.
- **Acreage** — limited premium plots that boost any rig placed on them.

Token utility beyond this is a later conversation.

---

## Pool solvency

**Expected payout per drill must be below drill cost.** That's the house edge.

Two structural buffers:

1. Payouts stream over time, so the pool always holds more than it currently
   owes
2. Scrap settles liabilities at a discount, shrinking total obligations

**Circuit breaker:** if pool coverage falls below a set ratio, global production
rates scale down — "field-wide pressure loss." Disclose that this exists before
launch. A stated throttle is a mechanic; an unstated one discovered later is
what ends projects.

---

## Provable fairness

- Rolls resolved by verifiable randomness, **not blockhash** — on a
  single-sequencer chain the sequencer can manipulate blockhash outcomes
- Every roll independently verifiable on-chain
- Odds table immutable, or timelocked with advance notice
- Pool balance and coverage ratio live in the UI

This is a marketing asset. "Provably fair, odds published, pool balance live"
is what separates you from everything else launching that week.

---

## Treasury revenue

- **House edge** on every drill — main line
- **Scrap discount** — the gap between scrap value and true value
- **Merge and workover fees**

No secondary royalty, since there's no secondary market. The scrap discount
more than replaces it.

---

## Say it plainly

- Payouts come from other players' deposits. No external revenue.
- The house edge means the average player loses. Show it.
- Someone loses for someone to win.

State this on the site. This audience already knows, and not insulting them
costs you nothing.

---

## Build order

1. **Simulate the odds table** — house edge, pool coverage over time, worst
   case run of Legendary hits, and scrap-rate behavior under different player
   mixes. Nothing else until this is right.
2. **Verify VRF exists** on the target chain. No VRF, no game.
3. **Test USDC to USO conversion** at realistic size. Measure real slippage.
4. Deposit and roll contract.
5. Rig accrual and scrap logic.
6. The reveal UI. Budget serious time.
7. Merge, workover, acreage.

---

## Open

- Odds table numbers and house edge sizing
- Scrap rates per tier and the decay curve on scrap value
- Cash-vs-credit spread
- Drill cost — single price or tiered stakes?
- Pity timer threshold
- Payout duration per tier (fast and short, or slow and long?)
