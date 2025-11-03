#!/usr/bin/env tsx
/**
 * Script to check if Whop SDK has transfers API
 * Run with: bun run scripts/check-transfer-api.ts
 * Or: npx tsx scripts/check-transfer-api.ts
 */

import { WhopServerSdk } from '@whop/api'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

// Load env vars
dotenv.config({ path: resolve(process.cwd(), '.env.local') })
dotenv.config({ path: resolve(process.cwd(), '.env') })

const whop = WhopServerSdk({
  appId: process.env.NEXT_PUBLIC_WHOP_APP_ID || 'test',
  appApiKey: process.env.WHOP_API_KEY || 'test',
  onBehalfOfUserId: process.env.NEXT_PUBLIC_WHOP_AGENT_USER_ID || 'test',
  companyId: process.env.NEXT_PUBLIC_WHOP_COMPANY_ID || 'test',
})

console.log('=== Whop SDK Inspection ===\n')
console.log('Top-level keys:', Object.keys(whop))
console.log('\n--- Checking for transfers ---')
console.log('transfers exists:', 'transfers' in whop)
console.log('transfers type:', typeof (whop as any).transfers)
console.log('transfers value:', (whop as any).transfers ? 'defined' : 'undefined')

if ((whop as any).transfers) {
  console.log('transfers methods:', Object.keys((whop as any).transfers))
  console.log('createTransfer exists:', typeof (whop as any).transfers?.createTransfer === 'function')
  console.log('createTransfer type:', typeof (whop as any).transfers?.createTransfer)
} else {
  console.log('❌ transfers NOT found on whop object')
}

console.log('\n--- All available properties ---')
for (const key of Object.keys(whop)) {
  const value = (whop as any)[key]
  console.log(`\n${key}:`)
  console.log('  type:', typeof value)
  if (typeof value === 'object' && value !== null) {
    console.log('  methods:', Object.keys(value).slice(0, 10)) // First 10 methods
  }
}

console.log('\n=== Inspection Complete ===')


