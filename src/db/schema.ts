import { boolean, decimal, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// Enums
export const oddFormatEnum = pgEnum('odd_format', ['american', 'decimal', 'fractional'])
export const betResultEnum = pgEnum('bet_result', ['pending', 'win', 'lose', 'returned'])
export const betCategoryEnum = pgEnum('bet_category', [
  'game_match',
  'player',
  'team',
  'corners_cards',
  'period_time'
])

// Bets table
export const bets = pgTable('bets', {
	id: uuid('id').defaultRandom().primaryKey(),
	userId: text('user_id').notNull(),
	sport: text('sport').notNull().default('Other'),
	game: text('game').notNull(),
	outcome: text('outcome').notNull(),
	betCategory: betCategoryEnum('bet_category').notNull().default('game_match'),
	oddFormat: oddFormatEnum('odd_format').notNull(),
	oddValue: decimal('odd_value', { precision: 10, scale: 2 }).notNull(),
	unitsInvested: decimal('units_invested', { precision: 10, scale: 2 }),
	dollarsInvested: decimal('dollars_invested', { precision: 10, scale: 2 }),
	result: betResultEnum('result').notNull().default('pending'),
	isCommunityBet: boolean('is_community_bet').notNull().default(false),
	createdById: text('created_by_id').notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// User stats table for leaderboard
export const userStats = pgTable('user_stats', {
	id: uuid('id').defaultRandom().primaryKey(),
	userId: text('user_id').notNull().unique(),
	username: text('username').notNull(),
	totalBets: integer('total_bets').notNull().default(0),
	wonBets: integer('won_bets').notNull().default(0),
	totalUnitsInvested: decimal('total_units_invested', { precision: 15, scale: 2 }).notNull().default('0'),
	totalUnitsWon: decimal('total_units_won', { precision: 15, scale: 2 }).notNull().default('0'),
	totalDollarsInvested: decimal('total_dollars_invested', { precision: 15, scale: 2 }).notNull().default('0'),
	totalDollarsWon: decimal('total_dollars_won', { precision: 15, scale: 2 }).notNull().default('0'),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Upcoming bets table for admin predictions
export const upcomingBets = pgTable('upcoming_bets', {
	id: uuid('id').defaultRandom().primaryKey(),
	sport: text('sport').notNull(),
	game: text('game').notNull(),
	outcome: text('outcome').notNull(),
	betCategory: betCategoryEnum('bet_category').notNull().default('game_match'),
	oddFormat: oddFormatEnum('odd_format').notNull(),
	oddValue: decimal('odd_value', { precision: 10, scale: 2 }).notNull(),
	explanation: text('explanation').notNull(),
	eventDate: timestamp('event_date').notNull(),
	createdById: text('created_by_id').notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
