import { vercel } from '@t3-oss/env-core/presets-zod'
import { createEnv } from '@t3-oss/env-nextjs'
import z from 'zod'

export const env = createEnv({
	server: {
		WHOP_API_KEY: z.string(),

		// Whop Payments
		ONE_TIME_PURCHASE_ACCESS_PASS_PLAN_ID: z.string(),
		ONE_TIME_PURCHASE_ACCESS_PASS_ID: z.string(),
		SUBSCRIPTION_PURCHASE_ACCESS_PASS_PLAN_ID: z.string(),
		SUBSCRIPTION_PURCHASE_ACCESS_PASS_ID: z.string(),

		// Ad Banner Products (Access Passes)
		AD_BANNER_1_MINUTE_PROD_ID: z.string(),
		AD_BANNER_1_DAY_PROD_ID: z.string(),
		AD_BANNER_1_WEEK_PROD_ID: z.string(),
		AD_BANNER_1_MONTH_PROD_ID: z.string(),
		
		// Ad Banner Plans (Pricing Plans)
		AD_BANNER_1_MINUTE_PLAN_ID: z.string(),
		AD_BANNER_1_DAY_PLAN_ID: z.string(),
		AD_BANNER_1_WEEK_PLAN_ID: z.string(),
		AD_BANNER_1_MONTH_PLAN_ID: z.string(),
	},
	client: {
		NEXT_PUBLIC_WHOP_APP_ID: z.string(),
		NEXT_PUBLIC_WHOP_AGENT_USER_ID: z.string(),
		NEXT_PUBLIC_WHOP_COMPANY_ID: z.string(),
	},
	runtimeEnv: {
		// Server
		WHOP_API_KEY: process.env.WHOP_API_KEY,
		ONE_TIME_PURCHASE_ACCESS_PASS_PLAN_ID: process.env.ONE_TIME_PURCHASE_ACCESS_PASS_PLAN_ID,
		ONE_TIME_PURCHASE_ACCESS_PASS_ID: process.env.ONE_TIME_PURCHASE_ACCESS_PASS_ID,
		SUBSCRIPTION_PURCHASE_ACCESS_PASS_PLAN_ID:
			process.env.SUBSCRIPTION_PURCHASE_ACCESS_PASS_PLAN_ID,
		SUBSCRIPTION_PURCHASE_ACCESS_PASS_ID: process.env.SUBSCRIPTION_PURCHASE_ACCESS_PASS_ID,

		// Ad Banner Products (Access Passes)
		AD_BANNER_1_MINUTE_PROD_ID: process.env.AD_BANNER_1_MINUTE_PROD_ID,
		AD_BANNER_1_DAY_PROD_ID: process.env.AD_BANNER_1_DAY_PROD_ID,
		AD_BANNER_1_WEEK_PROD_ID: process.env.AD_BANNER_1_WEEK_PROD_ID,
		AD_BANNER_1_MONTH_PROD_ID: process.env.AD_BANNER_1_MONTH_PROD_ID,
		
		// Ad Banner Plans (Pricing Plans)
		AD_BANNER_1_MINUTE_PLAN_ID: process.env.AD_BANNER_1_MINUTE_PLAN_ID,
		AD_BANNER_1_DAY_PLAN_ID: process.env.AD_BANNER_1_DAY_PLAN_ID,
		AD_BANNER_1_WEEK_PLAN_ID: process.env.AD_BANNER_1_WEEK_PLAN_ID,
		AD_BANNER_1_MONTH_PLAN_ID: process.env.AD_BANNER_1_MONTH_PLAN_ID,

		// Client
		NEXT_PUBLIC_WHOP_APP_ID: process.env.NEXT_PUBLIC_WHOP_APP_ID,
		NEXT_PUBLIC_WHOP_AGENT_USER_ID: process.env.NEXT_PUBLIC_WHOP_AGENT_USER_ID,
		NEXT_PUBLIC_WHOP_COMPANY_ID: process.env.NEXT_PUBLIC_WHOP_COMPANY_ID,
	},
	extends: [vercel()],
})
