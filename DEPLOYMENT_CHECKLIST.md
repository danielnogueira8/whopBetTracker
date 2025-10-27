# Production Deployment Checklist

## Environment Variables Required in Vercel/Whop

### Required Variables (Set These Now)

```
WHOP_API_KEY=your_whop_api_key
DATABASE_URL=postgresql://user:password@host:5432/database
NEXT_PUBLIC_WHOP_APP_ID=your_whop_app_id
NEXT_PUBLIC_WHOP_AGENT_USER_ID=your_agent_user_id
NEXT_PUBLIC_WHOP_COMPANY_ID=your_company_id
ONE_TIME_PURCHASE_ACCESS_PASS_PLAN_ID=your_plan_id
ONE_TIME_PURCHASE_ACCESS_PASS_ID=your_access_pass_id
SUBSCRIPTION_PURCHASE_ACCESS_PASS_PLAN_ID=your_subscription_plan_id
SUBSCRIPTION_PURCHASE_ACCESS_PASS_ID=your_subscription_access_pass_id
```

### Optional Variables (If Using Supabase Features)
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Steps to Fix the 500 Error

1. **Go to your Vercel/Whop deployment dashboard**
2. **Navigate to Environment Variables section**
3. **Add the missing environment variables listed above**
4. **Redeploy the app** (Vercel should auto-deploy if connected to GitHub)

## How to Set Environment Variables in Vercel

1. Go to your Vercel project dashboard
2. Click on "Settings"
3. Click on "Environment Variables"
4. Add each variable one by one:
   - Name: `WHOP_API_KEY`
   - Value: (paste your value)
   - Environment: Production (and Preview if needed)
5. Click "Save"
6. Repeat for all required variables
7. Redeploy: Go to "Deployments" tab → Find the latest deployment → Click the three dots → "Redeploy"

## Critical Variables (Must Have)

These MUST be set or the app will crash:

- `DATABASE_URL` - Your PostgreSQL connection string
- `WHOP_API_KEY` - Your Whop API key
- `NEXT_PUBLIC_WHOP_APP_ID` - Your Whop app ID
- `NEXT_PUBLIC_WHOP_AGENT_USER_ID` - Your agent user ID
- `NEXT_PUBLIC_WHOP_COMPANY_ID` - Your Whop company ID

## Database Setup

If you haven't set up the database yet:

### Option 1: Supabase (Recommended)

1. Go to https://supabase.com
2. Create a new project
3. Get your connection string from Project Settings → Database → Connection string
4. Set `DATABASE_URL` to this connection string
5. Also add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from API settings

### Option 2: Railway / Neon / Other PostgreSQL

1. Create a PostgreSQL database
2. Get the connection string
3. Set `DATABASE_URL` to this connection string
4. Run migrations: `pnpm drizzle-kit push` (or set up in your deployment pipeline)

## After Adding Environment Variables

1. The app should auto-redeploy
2. Check the deployment logs for any errors
3. Try accessing your app URL again
4. The 500 error should be resolved

## Troubleshooting

If you still get a 500 error:

1. Check Vercel deployment logs
2. Look for specific error messages
3. Verify all required environment variables are set
4. Ensure `DATABASE_URL` points to an accessible database
5. Make sure the database has been initialized with the schema (`drizzle-kit push`)

