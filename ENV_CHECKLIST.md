# ENVIRONMENT VARIABLES CHECKLIST FOR PRODUCTION

## CRITICAL - Must Be Set

### Database
- DATABASE_URL (PostgreSQL connection string)
  - Example: postgresql://user:password@host:5432/database

### Whop Configuration  
- WHOP_API_KEY (Server-side, keep secret)
- NEXT_PUBLIC_WHOP_APP_ID (Public app ID)
- NEXT_PUBLIC_WHOP_AGENT_USER_ID (Agent user ID)
- NEXT_PUBLIC_WHOP_COMPANY_ID (Company ID)

### Payment Setup (For checkout features)
- ONE_TIME_PURCHASE_ACCESS_PASS_PLAN_ID
- ONE_TIME_PURCHASE_ACCESS_PASS_ID
- SUBSCRIPTION_PURCHASE_ACCESS_PASS_PLAN_ID
- SUBSCRIPTION_PURCHASE_ACCESS_PASS_ID

## OPTIONAL - For Supabase Features
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY

## Auto-Set by Vercel
- NEXT_PUBLIC_VERCEL_URL (automatically set)

## HOW TO SET IN VERCEL

1. Go to your Vercel project
2. Click Settings → Environment Variables
3. Add each variable above
4. Select "Production" environment
5. Click Save
6. Redeploy

## TO TEST LOCALLY

Copy your .env file values and make sure DATABASE_URL is set.

Run: pnpm drizzle-kit push (to initialize database schema)
