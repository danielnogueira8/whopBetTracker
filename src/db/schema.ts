import { boolean, decimal, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

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
export const adBannerDurationEnum = pgEnum('ad_banner_duration', ['1_minute', '1_day', '1_week', '1_month'])
export const adBannerStatusEnum = pgEnum('ad_banner_status', ['active', 'expired', 'pending'])

// Bets table
export const bets = pgTable('bets', {
	id: uuid('id').defaultRandom().primaryKey(),
	experienceId: text('experience_id').notNull(),
	userId: text('user_id').notNull(),
	sport: text('sport').notNull().default('Other'),
	league: text('league'),
	game: text('game').notNull(),
	outcome: text('outcome').notNull(),
	betCategory: betCategoryEnum('bet_category').notNull().default('game_match'),
	oddFormat: oddFormatEnum('odd_format').notNull(),
	oddValue: decimal('odd_value', { precision: 10, scale: 2 }).notNull(),
	unitsInvested: decimal('units_invested', { precision: 10, scale: 2 }),
	dollarsInvested: decimal('dollars_invested', { precision: 10, scale: 2 }),
	result: betResultEnum('result').notNull().default('pending'),
	isCommunityBet: boolean('is_community_bet').notNull().default(false),
	notes: text('notes'),
	confidenceLevel: integer('confidence_level').default(5), // 1-10 scale
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
	hasCompletedOnboarding: boolean('has_completed_onboarding').notNull().default(false),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Upcoming bets table for admin predictions
export const upcomingBets = pgTable('upcoming_bets', {
	id: uuid('id').defaultRandom().primaryKey(),
	experienceId: text('experience_id').notNull(),
	sport: text('sport').notNull(),
	league: text('league'),
	game: text('game').notNull(),
	outcome: text('outcome').notNull(),
	betCategory: betCategoryEnum('bet_category').notNull().default('game_match'),
	oddFormat: oddFormatEnum('odd_format').notNull(),
	oddValue: decimal('odd_value', { precision: 10, scale: 2 }).notNull(),
	explanation: text('explanation'), // Optional explanation
	confidenceLevel: integer('confidence_level').default(5), // 1-10 scale
	unitsToInvest: decimal('units_to_invest', { precision: 10, scale: 2 }),
	eventDate: timestamp('event_date').notNull(),
	createdById: text('created_by_id').notNull(),
	forumPostId: text('forum_post_id'), // Links to Whop forum post
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Ad banners table for purchasable banner ads
export const adBanners = pgTable('ad_banners', {
	id: uuid('id').defaultRandom().primaryKey(),
	userId: text('user_id').notNull(),
	imageUrl: text('image_url').notNull(),
	linkUrl: text('link_url'),
	title: text('title'),
	duration: adBannerDurationEnum('duration').notNull(),
	startTime: timestamp('start_time').notNull(),
	endTime: timestamp('end_time').notNull(),
	purchaseReceiptId: text('purchase_receipt_id').notNull(),
	status: adBannerStatusEnum('status').notNull().default('pending'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Experience settings table for forum integration
export const experienceSettings = pgTable('experience_settings', {
	id: uuid('id').defaultRandom().primaryKey(),
	experienceId: text('experience_id').notNull().unique(),
	forumId: text('forum_id'),
	autoPostEnabled: boolean('auto_post_enabled').notNull().default(false),
	paywallConfig: jsonb('paywall_config'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Parlays table for multi-leg bets
export const parlays = pgTable('parlays', {
	id: uuid('id').defaultRandom().primaryKey(),
	experienceId: text('experience_id').notNull(),
	userId: text('user_id'), // null for upcoming bets (admin picks)
	name: text('name').notNull(), // e.g., "Sunday 3-Leg Parlay"
	combinedOddFormat: oddFormatEnum('combined_odd_format').notNull(),
	combinedOddValue: decimal('combined_odd_value', { precision: 10, scale: 2 }).notNull(),
	unitsInvested: decimal('units_invested', { precision: 10, scale: 2 }),
	dollarsInvested: decimal('dollars_invested', { precision: 10, scale: 2 }),
	result: betResultEnum('result').notNull().default('pending'),
	isCommunityBet: boolean('is_community_bet').notNull().default(false),
	isUpcomingBet: boolean('is_upcoming_bet').notNull().default(false),
	notes: text('notes'),
	forumPostId: text('forum_post_id'), // for upcoming bet parlays
	eventDate: timestamp('event_date'), // for upcoming bet parlays
	explanation: text('explanation'), // for upcoming bet parlays
	confidenceLevel: integer('confidence_level'), // 1-10 scale, for upcoming bet parlays
	createdById: text('created_by_id').notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Parlay legs table for individual legs within a parlay
export const parlayLegs = pgTable('parlay_legs', {
	id: uuid('id').defaultRandom().primaryKey(),
	parlayId: uuid('parlay_id').notNull().references(() => parlays.id, { onDelete: 'cascade' }),
	sport: text('sport').notNull(),
	league: text('league'),
	game: text('game').notNull(),
	outcome: text('outcome').notNull(),
	betCategory: betCategoryEnum('bet_category').notNull().default('game_match'),
	oddFormat: oddFormatEnum('odd_format').notNull(),
	oddValue: decimal('odd_value', { precision: 10, scale: 2 }).notNull(),
	result: betResultEnum('result').notNull().default('pending'),
	legOrder: integer('leg_order').notNull(), // 1, 2, 3, etc.
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Per-bet sale listings (admins list locked upcoming bets for sale)
export const betSaleListings = pgTable('bet_sale_listings', {
	id: uuid('id').defaultRandom().primaryKey(),
	betId: uuid('bet_id').notNull().references(() => upcomingBets.id, { onDelete: 'cascade' }),
	sellerUserId: text('seller_user_id').notNull(),
	priceCents: integer('price_cents').notNull(),
	currency: text('currency').notNull().default('usd'),
	active: boolean('active').notNull().default(true),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Purchases of individual bet access
export const betPurchases = pgTable('bet_purchases', {
	id: uuid('id').defaultRandom().primaryKey(),
	listingId: uuid('listing_id').notNull().references(() => betSaleListings.id, { onDelete: 'cascade' }),
	buyerUserId: text('buyer_user_id').notNull(),
	checkoutId: text('checkout_id').notNull(),
	amountCents: integer('amount_cents').notNull(),
	currency: text('currency').notNull().default('usd'),
	status: text('status').notNull().default('pending'), // pending|succeeded|refunded|failed
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Granted access to a specific upcoming bet for a user
export const userBetAccess = pgTable('user_bet_access', {
	id: uuid('id').defaultRandom().primaryKey(),
	betId: uuid('bet_id').notNull().references(() => upcomingBets.id, { onDelete: 'cascade' }),
	userId: text('user_id').notNull(),
	source: text('source').notNull().default('purchase'), // purchase|grant
	createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Ledger of fees and payouts per bet purchase
export const appFeesLedger = pgTable('app_fees_ledger', {
	id: uuid('id').defaultRandom().primaryKey(),
	purchaseId: uuid('purchase_id').notNull().references(() => betPurchases.id, { onDelete: 'cascade' }),
	grossCents: integer('gross_cents').notNull(),
	feeCents: integer('fee_cents').notNull(), // 10%
	netCents: integer('net_cents').notNull(), // to seller
	payoutTransferId: text('payout_transfer_id'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Parlay sales
export const parlaySaleListings = pgTable('parlay_sale_listings', {
	id: uuid('id').defaultRandom().primaryKey(),
	parlayId: uuid('parlay_id').notNull().references(() => parlays.id, { onDelete: 'cascade' }),
	sellerUserId: text('seller_user_id').notNull(),
	priceCents: integer('price_cents').notNull(),
	currency: text('currency').notNull().default('usd'),
	active: boolean('active').notNull().default(true),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const parlayPurchases = pgTable('parlay_purchases', {
	id: uuid('id').defaultRandom().primaryKey(),
	listingId: uuid('listing_id').notNull().references(() => parlaySaleListings.id, { onDelete: 'cascade' }),
	buyerUserId: text('buyer_user_id').notNull(),
	checkoutId: text('checkout_id').notNull(),
	amountCents: integer('amount_cents').notNull(),
	currency: text('currency').notNull().default('usd'),
	status: text('status').notNull().default('pending'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const userParlayAccess = pgTable('user_parlay_access', {
	id: uuid('id').defaultRandom().primaryKey(),
	parlayId: uuid('parlay_id').notNull().references(() => parlays.id, { onDelete: 'cascade' }),
	userId: text('user_id').notNull(),
	source: text('source').notNull().default('purchase'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const parlayFeesLedger = pgTable('parlay_fees_ledger', {
	id: uuid('id').defaultRandom().primaryKey(),
	purchaseId: uuid('purchase_id').notNull().references(() => parlayPurchases.id, { onDelete: 'cascade' }),
	grossCents: integer('gross_cents').notNull(),
	feeCents: integer('fee_cents').notNull(),
	netCents: integer('net_cents').notNull(),
	payoutTransferId: text('payout_transfer_id'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Seller permissions table - stores seller's Whop company ID for direct payments
export const sellerPermissions = pgTable('seller_permissions', {
	id: uuid('id').defaultRandom().primaryKey(),
	userId: text('user_id').notNull().unique(),
	whopCompanyId: text('whop_company_id').notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
