# Whop Bet Tracker

A comprehensive betting analytics application built for the Whop platform that allows communities to track, analyze, and compete on betting performance.

## Overview

Whop Bet Tracker is a Whop app that enables communities to:
- **Track Community Bets**: Admins create and track community-wide bets with detailed analytics
- **Personal Bet Tracking**: Users log their individual bets and track their personal performance
- **Global Competition**: Compete on leaderboards showing ROI, win rates, and performance metrics
- **Rich Analytics**: Dive deep into performance with charts, breakdowns by sport, and timeline analysis
- **Predictions**: Admins can create upcoming betting predictions that can be converted to actual tracked bets

## Key Features

### Community Bet Tracking
- Admins create and manage community bets that all members can view
- Track multiple sports with custom bet types and outcomes
- Filter bets by sport, result, odds range, and bet type
- Flexible odds formats (American, Decimal, Fractional) with user preference settings
- Real-time analytics and performance tracking

### Personal Bet Tracking  
- Users maintain their own private bet log
- All the same powerful filtering and tracking capabilities as community bets
- Personal analytics dashboard with cumulative performance charts
- Performance breakdown by sport and timeline analysis

### Leaderboards
- **Community Leaderboard**: Shows individual members' performance within the community
- **Global Leaderboard**: Compete across all communities with ROI-based rankings
- Smart ROI calculation based on win rate and average odds
- Displays average odds in preferred format
- Tooltips explaining the ROI calculation formula

### Analytics Dashboard
- Overview cards showing total bets, win rate, wins, losses, and net units
- Interactive line charts tracking cumulative units won/lost over time
- Performance breakdown by sport with progress bars
- Monthly timeline analysis of betting activity
- Available for both community and personal tracking

### Upcoming Bets
- Admins create predictions with explanations and event dates
- Bet type categorization (Match Bets, Player Props, Team Bets, etc.)
- Can be converted to tracked community bets once results are known
- Clean card-based layout for easy browsing

### User Experience
- Modern dark mode support with orange theme
- Responsive design with shadcn/ui components
- Loading states and empty states throughout
- Settings dialog for preferred odds display format
- Intuitive navigation with sidebar menu

## Technical Stack

- **Framework**: Next.js 16 (Turbopack) with App Router
- **Database**: PostgreSQL with Drizzle ORM
- **UI Components**: shadcn/ui with Tailwind CSS
- **Data Fetching**: TanStack React Query
- **Charts**: Recharts
- **Authentication**: Whop SDK integration
- **Package Manager**: pnpm

## Prerequisites

- [Bun](https://bun.sh) v1.0 or later
- A Whop account with a company

## Quick Start

Install dependencies:

```bash
bun install
```

Start the development server:

```bash
bun dev
```

Your app will be available at the URL provided during setup.

## Database Setup

### SQLite

If you selected SQLite, your database is ready to use. A `sqlite.db` file will be created automatically in your project root on first run.

The database client is available at `src/db/index.ts`:

```typescript
import { db } from './db'
import { tasks } from './db/schema'

// Example query
const allTasks = await db.select().from(tasks)
```

### Supabase

If you selected Supabase, follow these steps to complete the setup:

#### 1. Create a Supabase Project

1. Go to [app.supabase.com](https://app.supabase.com)
2. Click "New Project"
3. Choose your organization and set a database password
4. Wait for the project to be created

#### 2. Get Your Credentials

**API Credentials** (Project Settings > API):
- `NEXT_PUBLIC_SUPABASE_URL` - Your project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` - Your service role key (keep this secret!)

**Database Connection** (Project Settings > Database):
- Scroll to "Connection String"
- Select "URI" tab
- Copy the connection string
- Replace `[YOUR-PASSWORD]` with your database password
- Set this as `DATABASE_URL`

#### 3. Update Your .env File

Replace the placeholder values in your `.env` file with the credentials from step 2.

#### 4. Push Your Schema

Run this command to create the initial database schema:

```bash
bun db:push
```

#### 5. Use the Database

You now have two clients available:

**Drizzle Client** (type-safe queries):
```typescript
import { db } from './db'
import { tasks } from './db/schema'

const allTasks = await db.select().from(tasks)
```

**Supabase Client** (auth, storage, realtime):
```typescript
import { supabase } from './db'

// Authentication
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password'
})

// Storage
const { data, error } = await supabase.storage
  .from('bucket')
  .upload('file.png', file)

// Realtime
const channel = supabase.channel('room-1')
  .on('broadcast', { event: 'test' }, (payload) => {
    console.log(payload)
  })
  .subscribe()
```

## Available Scripts

### Development

- `bun dev` - Start the development server
- `bun build` - Build for production
- `bun start` - Start the production server

### Database Scripts (if database is enabled)

- `bun db:generate` - Generate migration files from your schema
- `bun db:push` - Push your schema directly to the database (no migration files)
- `bun db:migrate` - Run pending migrations
- `bun db:studio` - Open Drizzle Studio (visual database browser)

## Project Structure

```
├── src/
│   ├── app/                    # Next.js app directory
│   │   ├── (whop-api)/        # Whop API routes
│   │   │   └── api/
│   │   │       └── experience/
│   │   └── experiences/       # Your app's pages
│   ├── components/            # React components
│   │   └── whop-context/     # Whop SDK context and hooks
│   ├── db/                    # Database (if enabled)
│   │   ├── index.ts          # Database clients
│   │   └── schema.ts         # Database schema
│   ├── lib/                   # Utility functions
│   │   └── whop.ts           # Server-side Whop SDK
│   └── env.ts                 # Environment variables validation
├── .env                       # Environment variables
└── next.config.ts             # Next.js configuration
```

## Seller Permissions & App Installation

When sellers want to create and sell bets or parlays, the app must be installed on their company with the `access_pass:create` permission.

### For Sellers (Company Admins)

If you're selling bets or parlays, you need to:

1. **Install the app on your company**:
   - Go to your Whop company dashboard
   - Navigate to Apps
   - Find and install the Whop Bet Tracker app
   - When prompted, grant the `access_pass:create` permission

2. **Why this is needed**:
   - The app creates access passes for each bet/parlay you sell
   - These access passes enable checkout and payment processing
   - Without this permission, buyers cannot purchase your bets/parlays

### Error Handling

If you encounter the error "You do not have permission to perform this action. Required permission: access_pass:create", it means:

- The app is not installed on your company, OR
- The app is installed but doesn't have the `access_pass:create` permission

**Solution**: Install the app on your company and ensure the `access_pass:create` permission is granted during installation.

## Whop Integration

### Client-Side SDK

Use the Whop context in your React components:

```typescript
'use client'
import { useWhop } from '@/components/whop-context'

export default function MyComponent() {
  const whop = useWhop()
  
  // Access user data
  const user = whop.user
  
  // Make API calls
  const data = await whop.GET('/api/v5/me')
  
  return <div>Hello {user?.username}</div>
}
```

### Server-Side SDK

Use the Whop client in API routes and server components:

```typescript
import { whop } from '@/lib/whop'

// In API route or server component
const user = await whop.me()
```

## Environment Variables

Your `.env` file contains these variables:

- `WHOP_API_KEY` - Your app's API key
- `NEXT_PUBLIC_WHOP_APP_ID` - Your app's ID
- `NEXT_PUBLIC_WHOP_AGENT_USER_ID` - Agent user ID for testing
- `NEXT_PUBLIC_WHOP_COMPANY_ID` - Your company ID
- `ONE_TIME_PURCHASE_ACCESS_PASS_PLAN_ID` - Test one-time payment plan
- `ONE_TIME_PURCHASE_ACCESS_PASS_ID` - Test one-time payment access pass
- `SUBSCRIPTION_PURCHASE_ACCESS_PASS_PLAN_ID` - Test subscription plan
- `SUBSCRIPTION_PURCHASE_ACCESS_PASS_ID` - Test subscription access pass

If you selected Supabase, you'll also have:
- `DATABASE_URL` - PostgreSQL connection string
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key

## Learn More

- [Whop Documentation](https://docs.whop.com)
- [Whop SDK Reference](https://github.com/whopio/whop-sdk)
- [Next.js Documentation](https://nextjs.org/docs)
- [Drizzle ORM Documentation](https://orm.drizzle.team)
- [Supabase Documentation](https://supabase.com/docs) (if using Supabase)

## Support

For issues or questions:
- Whop Discord: [discord.gg/whop](https://discord.gg/whop)
- Whop Docs: [docs.whop.com](https://docs.whop.com)
