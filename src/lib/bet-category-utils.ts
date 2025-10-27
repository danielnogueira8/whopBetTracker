export type BetCategory = 
  | 'game_match'
  | 'player'
  | 'team'
  | 'corners_cards'
  | 'period_time'

export const betCategories: Record<BetCategory, { label: string; examples: string[] }> = {
  game_match: {
    label: 'Match Bets',
    examples: [
      'Moneyline / Match Winner',
      'Draw / Double Chance',
      'Over/Under (Totals)',
      'Handicap / Spread',
      'Correct Score',
      'Half-time / Full-time',
      'Both Teams to Score (BTTS)'
    ]
  },
  player: {
    label: 'Player Bets (Prop Bets)',
    examples: [
      'Anytime / First / Last Goalscorer',
      'Player to Score a Hat-Trick',
      'Player Assists / Shots on Target',
      'Player Points / Rebounds / Assists',
      'Player Touchdowns / Rushing Yards',
      'Player of the Match / MVP'
    ]
  },
  team: {
    label: 'Team Bets',
    examples: [
      'Team Total Goals / Points',
      'Team to Win to Nil / Clean Sheet',
      'Team to Score First / Last',
      'Team Shots / Corners / Cards'
    ]
  },
  corners_cards: {
    label: 'Corners & Cards Bets',
    examples: [
      'Total Corners (Over/Under)',
      'Most Corners (Team Comparison)',
      'First/Last Corner',
      'Total Yellow/Red Cards',
      'Carded Player / Team to Get Most Cards'
    ]
  },
  period_time: {
    label: 'Period / Time-Based Bets',
    examples: [
      '1st Half / 2nd Half Result',
      'Minutes of First Goal / First Point',
      'Winning Margin (by points/goals)',
      'Race to X Points'
    ]
  }
}

export function getBetCategoryLabel(category: BetCategory): string {
  return betCategories[category]?.label || category
}

