#!/usr/bin/env tsx
/**
 * Test Transfer API without sourceId (may be inferred from auth)
 */

import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })
dotenv.config({ path: resolve(process.cwd(), '.env') })

const WHOP_API_KEY = process.env.WHOP_API_KEY

async function testWithoutSource() {
  console.log('=== Testing Transfer API without sourceId ===\n')

  if (!WHOP_API_KEY) {
    console.error('❌ Missing WHOP_API_KEY')
    process.exit(1)
  }

  // Test 1: Without sourceId (may be inferred from authenticated company)
  console.log('Test 1: destinationId only (no sourceId)')
  const payload1 = {
    amount: 1,
    currency: 'usd',
    destinationId: 'biz_test_company',
    notes: 'Test without sourceId',
  }

  console.log('Payload:', JSON.stringify(payload1, null, 2))

  try {
    const response1 = await fetch('https://api.whop.com/api/v1/transfers', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHOP_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload1),
    })

    console.log('Status:', response1.status)
    const text1 = await response1.text()
    console.log('Response:', text1)

    if (response1.status === 400 && !text1.includes('Field is not defined')) {
      console.log('✓ Parameter format correct (error is about invalid company, not structure)')
    }
  } catch (error) {
    console.error('Error:', error)
  }

  // Test 2: Check GET endpoint to understand structure
  console.log('\n--- Test 2: Check GET endpoint structure ---')
  try {
    // GET requires origin_id or destination_id query param
    const response2 = await fetch('https://api.whop.com/api/v1/transfers?origin_id=biz_zfN839mM9pHuyK', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${WHOP_API_KEY}`,
      },
    })

    console.log('GET Status:', response2.status)
    if (response2.ok) {
      const data = await response2.json()
      console.log('Response keys:', Object.keys(data))
      if (data.transfers && data.transfers.length > 0) {
        console.log('Transfer example:', JSON.stringify(data.transfers[0], null, 2).slice(0, 500))
      }
    } else {
      const text = await response2.text()
      console.log('Response:', text)
    }
  } catch (error) {
    console.error('Error:', error)
  }

  console.log('\n=== Complete ===')
}

testWithoutSource().catch(console.error)



