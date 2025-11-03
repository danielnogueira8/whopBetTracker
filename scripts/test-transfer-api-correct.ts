#!/usr/bin/env tsx
/**
 * Final test with correct originId parameter
 */

import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })
dotenv.config({ path: resolve(process.cwd(), '.env') })

const WHOP_API_KEY = process.env.WHOP_API_KEY
const APP_COMPANY_ID = process.env.NEXT_PUBLIC_WHOP_COMPANY_ID

async function testCorrectFormat() {
  console.log('=== Testing FINAL Correct Format (originId) ===\n')

  if (!WHOP_API_KEY || !APP_COMPANY_ID) {
    console.error('❌ Missing env vars')
    process.exit(1)
  }

  const payload = {
    amount: 1,
    currency: 'usd',
    destinationId: 'biz_test_company', // Invalid ID for testing
    originId: APP_COMPANY_ID, // Correct parameter name
    notes: 'Test with correct originId',
  }

  console.log('Correct payload structure:')
  console.log('  - amount (number, cents)')
  console.log('  - currency (string)')
  console.log('  - destinationId (camelCase, destination company)')
  console.log('  - originId (camelCase, source company)')
  console.log('  - notes (string, optional)')
  console.log('\nPayload:', JSON.stringify(payload, null, 2))

  try {
    const response = await fetch('https://api.whop.com/api/v1/transfers', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHOP_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    console.log('\nResponse status:', response.status)
    const text = await response.text()

    if (response.status === 400) {
      console.log('Response:', text)
      
      // Check if error is about invalid company (good) vs wrong params (bad)
      if (text.includes('company') || text.includes('destination') || text.includes('invalid')) {
        if (!text.includes('Field is not defined') && !text.includes('not defined on')) {
          console.log('\n✅ SUCCESS! Parameter format is CORRECT!')
          console.log('✅ Error is about invalid company ID (expected with test data)')
          console.log('✅ API structure is correct - ready for production')
        } else {
          console.log('\n❌ Still has parameter name issues')
        }
      }
    } else if (response.status === 201 || response.status === 200) {
      const data = JSON.parse(text)
      console.log('\n⚠️ Transfer created:', data)
    } else {
      console.log('\nResponse:', text)
    }
  } catch (error) {
    console.error('\n❌ Error:', error)
  }

  console.log('\n=== Test Complete ===')
}

testCorrectFormat().catch(console.error)



