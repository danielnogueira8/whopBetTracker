// Normalization helpers for sport labels used in analytics breakdowns

export type SportKey = string;

// Map common aliases/abbreviations to canonical labels and leagues
const SPORT_ALIASES: Record<string, { sport: string; league?: string }> = {
  nba: { sport: "Basketball", league: "NBA" },
  basketball: { sport: "Basketball" },
  ncaab: { sport: "Basketball", league: "NCAAB" },
  cbb: { sport: "Basketball", league: "NCAAB" },

  nfl: { sport: "Football", league: "NFL" },
  football: { sport: "Football" },
  ncaaf: { sport: "Football", league: "NCAAF" },
  cfb: { sport: "Football", league: "NCAAF" },

  mlb: { sport: "Baseball", league: "MLB" },
  baseball: { sport: "Baseball" },

  nhl: { sport: "Hockey", league: "NHL" },
  hockey: { sport: "Hockey" },

  tennis: { sport: "Tennis" },
  atp: { sport: "Tennis", league: "ATP" },
  wta: { sport: "Tennis", league: "WTA" },
  itf: { sport: "Tennis", league: "ITF" },

  soccer: { sport: "Soccer" },
  futbol: { sport: "Soccer" },
};

/**
 * Produce a stable key for grouping sports.
 * - trims, collapses whitespace, lowercases
 * - applies alias mapping to return a canonical display label
 */
export function normalizeSportKey(raw: unknown): { key: SportKey; label: string; league?: string } | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  const lower = cleaned.toLowerCase();
  const alias = SPORT_ALIASES[lower];
  if (alias) {
    const key = alias.sport.toLowerCase();
    return { key, label: alias.sport, league: alias.league };
  }
  const label = capitalizeWords(cleaned);
  const key = label.toLowerCase();
  return { key, label };
}

export function capitalizeWords(input: string): string {
  return input
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}


