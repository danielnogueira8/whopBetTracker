import { normalizeSportKey } from "./sport-normalization";

type BetItem = any; // existing app uses dynamic shapes; keep lax here

export type SportStats = { total: number; wins: number; losses: number; pending: number; label: string };
export type LeagueStats = { total: number; wins: number; losses: number; pending: number; label: string; sport: string };

export function buildSportBreakdown(
  filteredBets: BetItem[]
): { sportBreakdown: Record<string, SportStats>; leagueBreakdown: Record<string, LeagueStats> } {
  const sportBreakdown: Record<string, SportStats> = {};
  const leagueBreakdown: Record<string, LeagueStats> = {};

  filteredBets.forEach((item) => {
    const addTo = (sportRaw: unknown, result: string, explicitLeague?: unknown) => {
      const normalized = normalizeSportKey(sportRaw);
      if (!normalized) return;
      const { key, label } = normalized;
      const league = typeof explicitLeague === "string" && explicitLeague.trim()
        ? (normalizeSportKey(explicitLeague)?.league ?? explicitLeague as string)
        : normalized.league;
      if (!sportBreakdown[key]) {
        sportBreakdown[key] = { total: 0, wins: 0, losses: 0, pending: 0, label };
      }
      if (result === "win") {
        sportBreakdown[key].wins++;
        sportBreakdown[key].total++;
      } else if (result === "lose") {
        sportBreakdown[key].losses++;
        sportBreakdown[key].total++;
      } else if (result === "pending") {
        sportBreakdown[key].pending++;
      }

      if (league) {
        const leagueKey = `${label}:${league}`.toLowerCase();
        if (!leagueBreakdown[leagueKey]) {
          leagueBreakdown[leagueKey] = { total: 0, wins: 0, losses: 0, pending: 0, label: league, sport: label };
        }
        if (result === "win") {
          leagueBreakdown[leagueKey].wins++;
          leagueBreakdown[leagueKey].total++;
        } else if (result === "lose") {
          leagueBreakdown[leagueKey].losses++;
          leagueBreakdown[leagueKey].total++;
        } else if (result === "pending") {
          leagueBreakdown[leagueKey].pending++;
        }
      }
    };

    if (item?.slipType === "single" || item?.type === "single") {
      addTo(item?.sport, item?.result, item?.league);
      return;
    }

    // Parlay: count per leg using leg.result; prefer leg.league when provided
    const legs = (item?.legs ?? []) as any[];
    for (const leg of legs) {
      addTo(leg?.sport, leg?.result, leg?.league);
    }
  });

  return { sportBreakdown, leagueBreakdown };
}


