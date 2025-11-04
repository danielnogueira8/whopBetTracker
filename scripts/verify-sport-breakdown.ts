import { buildSportBreakdown } from "~/lib/analytics";

/**
 * Lightweight check that ensures parlay legs count toward sport totals.
 * Run with: bun scripts/verify-sport-breakdown.ts
 */
const sample = [
  {
    slipType: "single",
    sport: "nfl",
    result: "win",
  },
  {
    slipType: "parlay",
    legs: [
      { sport: "nba", result: "win" },
      { sport: "nfl", result: "lose" },
      { sport: "nfl", result: "pending" },
    ],
  },
];

const { sportBreakdown } = buildSportBreakdown(sample as any[]);

const football = sportBreakdown?.football;
const basketball = sportBreakdown?.basketball;

if (!football || football.total !== 2 || football.wins !== 1 || football.losses !== 1 || football.pending !== 1) {
  console.error("[FAIL] Football totals incorrect", football);
  process.exit(1);
}

if (!basketball || basketball.total !== 1 || basketball.wins !== 1) {
  console.error("[FAIL] Basketball totals incorrect", basketball);
  process.exit(1);
}

console.log("[PASS] buildSportBreakdown counts parlay legs correctly.");

