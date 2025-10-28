// Parlay utility functions for odds calculation and result determination

import { toDecimal } from "./bet-utils"
import type { OddFormat } from "./bet-utils"

export type BetResult = "pending" | "win" | "lose" | "returned"

/**
 * Calculate combined parlay odds from individual leg odds
 * All legs are multiplied together in decimal format
 */
export function calculateParlayOdds(
  legs: Array<{ oddFormat: OddFormat; oddValue: string }>
): number {
  if (legs.length === 0) return 1

  // Convert all to decimal and multiply
  return legs.reduce((acc, leg) => {
    const decimal = toDecimal(parseFloat(leg.oddValue), leg.oddFormat)
    return acc * decimal
  }, 1)
}

/**
 * Calculate parlay result based on leg results
 * - Returns 'lose' if any leg lost
 * - Returns 'returned' if all legs returned
 * - Returns 'pending' if any leg is still pending
 * - Returns 'win' if all legs won
 */
export function calculateParlayResult(
  legResults: Array<"pending" | "win" | "lose" | "returned">
): "pending" | "win" | "lose" | "returned" {
  if (legResults.length === 0) return "pending"

  // If any leg lost, parlay loses
  if (legResults.some((r) => r === "lose")) return "lose"

  // If all legs returned, parlay is returned
  if (legResults.every((r) => r === "returned")) return "returned"

  // If any leg is still pending, parlay is pending
  if (legResults.some((r) => r === "pending")) return "pending"

  // All legs won (no loses, no pending)
  return "win"
}

/**
 * Validate parlay has minimum and maximum legs
 */
export function validateParlayLegs(legs: any[], minLegs: number = 2, maxLegs: number = 10): {
  valid: boolean
  error?: string
} {
  if (legs.length < minLegs) {
    return { valid: false, error: `Parlay must have at least ${minLegs} legs` }
  }
  if (legs.length > maxLegs) {
    return { valid: false, error: `Parlay cannot have more than ${maxLegs} legs` }
  }
  return { valid: true }
}

/**
 * Format parlay for display
 */
export function formatParlayName(name: string, legCount: number): string {
  return `${name} (${legCount}-Leg Parlay)`
}


