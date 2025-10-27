// Bet utility functions for odd conversions and calculations

export type OddFormat = "american" | "decimal" | "fractional";
export type BetResult = "pending" | "win" | "lose" | "returned";

/**
 * Convert odds from one format to another
 */
export function convertOdds(
  value: number,
  from: OddFormat,
  to: OddFormat
): number {
  let decimal = value;

  // Convert to decimal first
  switch (from) {
    case "american":
      decimal = value > 0 ? value / 100 + 1 : 100 / Math.abs(value) + 1;
      break;
    case "fractional":
      const [num, den] = value.toString().split("/").map(Number);
      decimal = num / den + 1;
      break;
    case "decimal":
      decimal = value;
      break;
  }

  // Convert from decimal to target format
  switch (to) {
    case "american":
      return decimal > 2 ? (decimal - 1) * 100 : -100 / (decimal - 1);
    case "fractional":
      const numerator = decimal - 1;
      const denominator = 1;
      return parseFloat(`${numerator}/${denominator}`);
    case "decimal":
      return decimal;
  }
}

/**
 * Calculate potential winnings from a bet
 */
export function calculateWinnings(
  unitsInvested: number | null,
  dollarsInvested: number | null,
  oddValue: number,
  oddFormat: OddFormat
): { unitsWon: number; dollarsWon: number } {
  const decimal = convertOdds(oddValue, oddFormat, "decimal");

  return {
    unitsWon: unitsInvested ? unitsInvested * decimal : 0,
    dollarsWon: dollarsInvested ? dollarsInvested * decimal : 0,
  };
}

/**
 * Calculate win rate
 */
export function calculateWinRate(totalBets: number, wonBets: number): number {
  if (totalBets === 0) return 0;
  return (wonBets / totalBets) * 100;
}

/**
 * Calculate ROI (Return on Investment)
 */
export function calculateROI(
  invested: number,
  won: number
): number {
  if (invested === 0) return 0;
  return ((won - invested) / invested) * 100;
}

/**
 * Convert odds from any format to decimal
 */
export function toDecimal(value: number | string, from: OddFormat): number {
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  switch (from) {
    case "american":
      return numValue > 0 ? numValue / 100 + 1 : 100 / Math.abs(numValue) + 1;
    case "decimal":
      return numValue;
    case "fractional":
      const strValue = value.toString();
      const [num, den] = strValue.includes("/") ? strValue.split("/").map(Number) : [numValue, 1];
      return num / den + 1;
  }
}

/**
 * Convert odds from decimal to any format
 */
export function fromDecimal(decimal: number, to: OddFormat): string {
  switch (to) {
    case "american":
      const american = decimal > 2 ? (decimal - 1) * 100 : -100 / (decimal - 1);
      return american > 0 ? `+${Math.round(american)}` : `${Math.round(american)}`;
    case "decimal":
      return decimal.toFixed(2);
    case "fractional":
      // Simplified: try common fractions
      const num = decimal - 1;
      const commonFractions = [
        [1, 2], [1, 3], [2, 3], [3, 2], [1, 4], [3, 4],
        [2, 5], [3, 5], [4, 5], [5, 4], [1, 5], [4, 1]
      ];
      for (const [n, d] of commonFractions) {
        if (Math.abs(num - n / d) < 0.1) {
          return `${n}/${d}`;
        }
      }
      // Approximate fraction
      const den = 1;
      const n = Math.round(num * 100);
      const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
      const divisor = gcd(n, 100);
      return `${n / divisor}/${100 / divisor}`;
  }
}

/**
 * Format odds for display
 */
export function formatOdds(value: number, format: OddFormat): string {
  switch (format) {
    case "american":
      return value > 0 ? `+${value}` : `${value}`;
    case "decimal":
      return value.toFixed(2);
    case "fractional":
      const parts = value.toString().split("/");
      if (parts.length === 2) {
        return `${parts[0]}/${parts[1]}`;
      }
      return `${value}/1`;
  }
}

/**
 * Display odds in user's preferred format
 */
export function displayOdds(value: number, storedFormat: OddFormat, displayFormat: OddFormat): string {
  const decimal = toDecimal(value, storedFormat);
  return fromDecimal(decimal, displayFormat);
}

/**
 * Calculate ROI using the formula:
 * ROI = (win_ratio * (average_odds - 1)) - (1 - win_ratio)
 * 
 * @param averageOdds - The average decimal odds of all bets (e.g., 2.5)
 * @param winRatio - The fraction of bets won (e.g., 0.45 for 45%)
 * @param asPercentage - If true, returns as percentage (e.g., 5); otherwise returns decimal (e.g., 0.05)
 * @returns The ROI as a decimal or percentage
 * 
 * @example
 * const roi = calculateBettingROI(2.2, 0.45); // Returns -0.01
 * const roiPercent = calculateBettingROI(2.2, 0.45, true); // Returns -1
 */
export function calculateBettingROI(
  averageOdds: number,
  winRatio: number,
  asPercentage: boolean = false
): number {
  // ROI = (win_ratio * (average_odds - 1)) - (1 - win_ratio)
  const roi = (winRatio * (averageOdds - 1)) - (1 - winRatio);
  
  if (asPercentage) {
    return roi * 100;
  }
  
  return roi;
}

