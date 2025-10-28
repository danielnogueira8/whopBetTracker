import type { InferSelectModel } from 'drizzle-orm'
import type { upcomingBets, parlays, parlayLegs } from '~/db/schema'

type UpcomingBet = InferSelectModel<typeof upcomingBets>
type Parlay = InferSelectModel<typeof parlays>
type ParlayLeg = InferSelectModel<typeof parlayLegs>

export interface ParlayWithLegs extends Parlay {
  legs: ParlayLeg[]
}

/**
 * Formats an upcoming bet as a markdown-formatted forum post
 */
export function formatUpcomingBetForForum(bet: UpcomingBet): string {
	const { sport, game, outcome, oddFormat, oddValue, explanation, confidenceLevel, unitsToInvest, eventDate } = bet

	// Format the odds based on format type
	const formattedOdds = formatOdds(oddFormat, oddValue)

	// Format the date
	const eventDateFormatted = new Date(eventDate).toLocaleString('en-US', {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	})

	// Format units to invest
	const unitsText = unitsToInvest ? `${unitsToInvest} units` : 'Not specified'

	// Build the post content
	let postContent = `## 🎯 ${game}\n\n`
	postContent += `**Sport:** ${sport}\n\n`
	postContent += `**Outcome:** ${outcome}\n\n`
	postContent += `**Odds:** ${formattedOdds} (${oddFormat})\n\n`
	postContent += `**Recommended Units:** ${unitsText}\n\n`
	postContent += `**Confidence Level:** ${confidenceLevel}/10\n\n`
	postContent += `**Event Date:** ${eventDateFormatted}\n\n`

	// Add explanation
	if (explanation) {
		postContent += `**Reasoning:**\n${explanation}\n\n`
	}

	// Add footer
	postContent += `---\n*This is an automated post from the Bet Tracker app*`

	return postContent
}

/**
 * Formats a parlay (upcoming bet) as a markdown-formatted forum post
 */
export function formatParlayForForum(parlay: ParlayWithLegs): string {
	const { name, combinedOddFormat, combinedOddValue, unitsInvested, eventDate, explanation, legs } = parlay

	// Format the combined odds
	const formattedOdds = formatOdds(combinedOddFormat, combinedOddValue)

	// Format the date
	let eventDateFormatted = ''
	if (eventDate) {
		eventDateFormatted = new Date(eventDate).toLocaleString('en-US', {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		})
	}

	// Format units to invest
	const unitsText = unitsInvested ? `${unitsInvested} units` : 'Not specified'

	// Build the post content
	let postContent = `## 🎯 PARLAY PICK: ${name}\n\n`
	postContent += `📊 ${legs.length}-Leg Parlay\n\n`
	postContent += `**Combined Odds:** ${formattedOdds} (${combinedOddFormat})\n\n`
	
	if (unitsInvested) {
		postContent += `**Units:** ${unitsInvested}u\n\n`
	}

	if (eventDate) {
		postContent += `**Event Date:** ${eventDateFormatted}\n\n`
	}

	// Add each leg
	postContent += `### Parlay Legs:\n\n`
	legs.forEach((leg, index) => {
		postContent += `**🔹 LEG ${index + 1}: ${leg.sport}**\n`
		postContent += `Game: ${leg.game}\n`
		postContent += `Pick: ${leg.outcome}\n`
		postContent += `Odds: ${formatOdds(leg.oddFormat, leg.oddValue)} (${leg.oddFormat})\n\n`
	})

	// Add explanation
	if (explanation) {
		postContent += `### 📝 Explanation:\n\n${explanation}\n\n`
	}

	// Add footer
	postContent += `---\n*This is an automated post from the Bet Tracker app*`

	return postContent
}

/**
 * Formats odds based on the format type
 */
function formatOdds(format: string, value: string | number): string {
	const numValue = typeof value === 'string' ? parseFloat(value) : value

	switch (format) {
		case 'american':
			// American odds: +150 or -200
			if (numValue > 0) {
				return `+${Math.round(numValue)}`
			}
			return `${Math.round(numValue)}`
		case 'decimal':
			// Decimal odds: 2.50
			return numValue.toFixed(2)
		case 'fractional':
			// Fractional odds: 3/2 or 1/3
			// Convert to fractional representation
			return convertToFractional(numValue)
		default:
			return value.toString()
	}
}

/**
 * Converts a decimal to fractional odds
 */
function convertToFractional(decimal: number): string {
	const tolerance = 0.001
	
	// For odds > 1, it's how much you win on a 1 unit bet
	// For odds < 1, it's the probability
	if (decimal < 1) {
		// Convert from probability/implied probability to fractional
		const numerator = 1 / decimal - 1
		return `${formatFraction(numerator)}`
	}

	// Already in format where decimal represents return
	const winAmount = decimal - 1
	return `${formatFraction(winAmount)}`
}

/**
 * Formats a decimal as a simplified fraction
 */
function formatFraction(decimal: number): string {
	// Common betting fractions
	const commonFractions: Record<string, number> = {
		'1/2': 0.5,
		'1/3': 0.333,
		'1/4': 0.25,
		'2/3': 0.667,
		'3/4': 0.75,
		'3/2': 1.5,
		'2/1': 2,
		'3/1': 3,
		'5/1': 5,
		'10/1': 10,
		'20/1': 20,
		'50/1': 50,
		'100/1': 100,
	}

	// Check if it's close to a common fraction
	for (const [fraction, value] of Object.entries(commonFractions)) {
		if (Math.abs(decimal - value) < 0.01) {
			return fraction
		}
	}

	// Otherwise, try to find a good approximation
	const denom = 100
	const num = Math.round(decimal * denom)
	const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
	const divisor = gcd(num, denom)
	return `${num / divisor}/${denom / divisor}`
}

