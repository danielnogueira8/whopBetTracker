#!/usr/bin/env tsx
/**
 * Final test script to verify correct Transfer API parameter format
 * Run with: bun run scripts/test-transfer-api-final.ts
 */

import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })
dotenv.config({ path: resolve(process.cwd(), '.env') })

const WHOP_API_KEY = process.env.WHOP_API_KEY
const APP_COMPANY_ID = process.env.NEXT_PUBLIC_WHOP_COMPANY_ID

async function testCorrectedFormat() {
  console.log('=== Testing Corrected Transfer API Format ===\n')

  if (!WHOP_API_KEY || !APP_COMPANY_ID) {
    console.error('❌ Missing environment variables')
    process.exit(1)
  }

  // Test with corrected camelCase format
  const testPayload = {
    amount: 1, // 1 cent
    currency: 'usd',
    destinationId: 'biz_test_company', // camelCase (not destination_company_id)
    sourceId: APP_COMPANY_ID, // camelCase (not source_company_id)
    notes: 'Test transfer with corrected format',
  }

  console.log('Testing with corrected format:')
  console.log('  - destinationId (camelCase) instead of destination_company_id')
  console.log('  - sourceId (camelCase) instead of source_company_id')
  console.log('\nPayload:', JSON.stringify(testPayload, null, 2))

  try {
    const response = await fetch('https://api.whop.com/api/v1/transfers', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHOP_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload),
    })

    console.log('\nResponse status:', response.status)
    const responseText = await response.text()
    
    if (response.status === 400) {
      console.log('\nResponse:', responseText)
      
      // Check if error is about invalid company ID (good) vs wrong parameter names (bad)
      if (responseText.includes('company') && !responseText.includes('Field is not defined')) {
        console.log('\n✓ Parameter names are correct!')
        console.log('✓ Error is about invalid company ID (expected with test data)')
        console.log('\n✅ API format is CORRECT - ready for production use')
      } else if (responseText.includes('Field is not defined')) {
        console.log('\n❌ Still have parameter name issues')
        console.log('Response indicates:', responseText)
      }
    } else if (response.status === 201 || response.status === 200) {
      const data = JSON.parse(responseText)
      console.log('\n⚠️ Transfer created successfully:', data)
      console.log('⚠️ Note: This was a test transfer - may need cleanup')
    } else {
      console.log('\nUnexpected status:', response.status)
      console.log('Response:', responseText)
    }
  } catch (error) {
    console.error('\n❌ Request failed:', error)
  }

  console.log('\n=== Test Complete ===')
}

testCorrectedFormat().catch(console.error)



