# Betting Stats Flow

This document captures the current data flow for statistics so we have a common reference point when debugging future issues.

## 1. Data Sources

- `bets` table — Single wagers, already normalized with `result`, `sport`, `league`, investment fields, etc.
- `parlays` table — Top-level multi-leg slips. Tracks overall result plus aggregate stake values.
- `parlay_legs` table — Individual legs within each parlay. Each leg has its own `result`, `sport`, `league`, and odds.

## 2. API Surface

| Endpoint | Purpose | Notes |
| --- | --- | --- |
| `GET /api/bets` | Fetches single bets (and community bets when `isCommunity=true`). | Returns rows from `bets` with minimal transformation. |
| `GET /api/parlays` | Fetches parlays plus embedded legs. | Used by dashboards, community pages, analytics. |
| `PATCH /api/parlays/[id]` | Updates parlay metadata and leg definitions. | Rebuilds legs from payload when supplied. |
| `PATCH /api/parlays/[id]/legs/[legId]` | Updates a single leg result. | Recomputes parent parlay result. |
| `GET /api/leaderboard` | Global user stats via `user_stats` table. | Aggregated separately from bet/parlay joins. |
| `GET /api/leaderboard/communities` | Community rankings backed by bets and parlay legs. | Now merges singles plus legs before calculating metrics. |

## 3. Front-End Consumption

1. **Community & My Bets pages**: call `/api/bets` and `/api/parlays`; each item tagged as `single` or `parlay`.
2. **Analytics pages**: merge bet + parlay payloads before running derived metrics (sport breakdown, league breakdown, ROI, etc.).
3. **Leaderboard page**:
   - Community tab merges `/api/bets?isCommunity=true` with `/api/parlays?isCommunity=true` (per-leg normalization performed client-side).
   - Global tab consumes `/api/leaderboard` for user stats and `/api/leaderboard/communities` for cross-community rankings.

## 4. Investment Handling

- Singles use `unitsInvested` and `dollarsInvested` as-is.
- When a parlay appears in community stats, its total stake is split evenly across legs so each leg contributes proportionally to totals/ROI.
- Leg updates now persist the `result` field end-to-end so analytics don’t revert pending states.

## 5. Key Utilities

- `src/lib/analytics.ts#buildSportBreakdown` — Aggregates wins/losses by sport and league. Expects normalized entries (singles or per-leg objects).
- `src/lib/parlay-utils.ts#calculateParlayResult` — Recomputes overall parlay result after leg updates.

## 6. Validation Hooks

- `scripts/verify-sport-breakdown.ts` (see step 4 in the remediation plan) can be run with `bun` to confirm parlay legs count correctly in sport breakdown stats.

Keeping this overview updated should make future debugging faster and satisfy the “audit-flows” step in the remediation plan.

