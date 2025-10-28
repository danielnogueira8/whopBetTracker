export type BetType = 
  | 'moneyline'
  | 'draw_double_chance'
  | 'over_under'
  | 'handicap_spread'
  | 'correct_score'
  | 'half_full_time'
  | 'both_teams_score'
  | 'player_scorer'
  | 'player_prop'
  | 'team_total'
  | 'team_prop'
  | 'corners_cards'
  | 'period_based'
  | 'other'

export function getBetTypeLabel(betType: string): string {
  const labels: Record<BetType, string> = {
    moneyline: 'Moneyline / Match Winner',
    draw_double_chance: 'Draw / Double Chance',
    over_under: 'Over/Under Totals',
    handicap_spread: 'Handicap / Spread',
    correct_score: 'Correct Score',
    half_full_time: 'Half-time / Full-time',
    both_teams_score: 'Both Teams to Score',
    player_scorer: 'Player Goalscorer',
    player_prop: 'Other Player Props',
    team_total: 'Team Total Points/Goals',
    team_prop: 'Team Props',
    corners_cards: 'Corners & Cards',
    period_based: 'Period / Time-Based',
    other: 'Other',
  }
  return labels[betType as BetType] || 'Other'
}

export const betTypeCategories = {
  'Game/Match Bets': ['moneyline', 'over_under', 'handicap_spread', 'both_teams_score', 'correct_score', 'half_full_time', 'draw_double_chance'],
  'Player Bets': ['player_scorer', 'player_prop'],
  'Team Bets': ['team_total', 'team_prop'],
  'Corners & Cards': ['corners_cards'],
  'Period-Based': ['period_based'],
  'Other': ['other'],
}


