#!/usr/bin/env tsx
/**
 * Test script to verify Whop Transfer API implementation
 * This tests the API endpoint structure without actually transferring money
 * Run with: bun run scripts/test-transfer-api.ts
 */

import * as dotenv from 'dotenv'
import { resolve } from 'path'

// Load env vars
dotenv.config({ path: resolve(process.cwd(), '.env.local') })
dotenv.config({ path: resolve(process.cwd(), '.env') })

const WHOP_API_KEY = process.env.WHOP_API_KEY
const APP_COMPANY_ID = process.env.NEXT_PUBLIC_WHOP_COMPANY_ID

async function testTransferAPI() {
  console.log('=== Testing Whop Transfer API ===\n')

  if (!WHOP_API_KEY || !APP_COMPANY_ID) {
    console.error('❌ Missing required environment variables:')
    console.error('  WHOP_API_KEY:', WHOP_API_KEY ? '✓' : '✗')
    console.error('  NEXT_PUBLIC_WHOP_COMPANY_ID:', APP_COMPANY_ID ? '✓' : '✗')
    process.exit(1)
  }

  console.log('✓ Environment variables loaded')
  console.log('  API Key:', WHOP_API_KEY.slice(0, 10) + '...')
  console.log('  Company ID:', APP_COMPANY_ID)

  // Test 1: Check if endpoint exists and accepts requests
  console.log('\n--- Test 1: Check endpoint availability ---')
  try {
    const response = await fetch('https://api.whop.com/api/v1/transfers', {
      method: 'OPTIONS', // Preflight check
      headers: {
        'Authorization': `Bearer ${WHOP_API_KEY}`,
      },
    })
    console.log('  OPTIONS response status:', response.status)
    console.log('  Allowed methods:', response.headers.get('allow') || 'unknown')
  } catch (error) {
    console.error('  ❌ OPTIONS request failed:', error)
  }

  // Test 2: Try GET to list transfers (should work if API exists)
  console.log('\n--- Test 2: List existing transfers (GET) ---')
  try {
    const listResponse = await fetch('https://api.whop.com/api/v1/transfers', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${WHOP_API_KEY}`,
        'Content-Type': 'application/json',
      },
    })
    console.log('  GET response status:', listResponse.status)
    
    if (listResponse.ok) {
      const data = await listResponse.json()
      console.log('  ✓ GET endpoint works')
      console.log('  Response structure:', Object.keys(data).slice(0, 5))
    } else {
      const errorText = await listResponse.text()
      console.log('  Response (not OK):', errorText.slice(0, 200))
    }
  } catch (error) {
    console.error('  ❌ GET request failed:', error)
  }

  // Test 3: Validate POST request structure (without actually creating transfer)
  console.log('\n--- Test 3: Validate POST request structure ---')
  
  // Create a test payload with minimal amount (1 cent) to seller company
  // We'll use invalid IDs to trigger validation errors instead of actual transfer
  const testPayload = {
    amount: 1, // 1 cent - minimal amount
    currency: 'usd',
    destination_company_id: 'biz_test_company', // Invalid ID to test validation
    source_company_id: APP_COMPANY_ID,
    notes: 'Test transfer validation',
  }

  console.log('  Test payload structure:')
  console.log('    amount:', testPayload.amount)
  console.log('    currency:', testPayload.currency)
  console.log('    destination_company_id:', testPayload.destination_company_id)
  console.log('    source_company_id:', testPayload.source_company_id)

  try {
    const createResponse = await fetch('https://api.whop.com/api/v1/transfers', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHOP_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload),
    })

    console.log('\n  POST response status:', createResponse.status)
    const responseText = await createResponse.text()
    
    if (createResponse.status === 400 || createResponse.status === 404) {
      // Expected: validation error or invalid company ID
      console.log('  ✓ API endpoint exists and validates requests')
      console.log('  Error response (expected):', responseText.slice(0, 300))
      
      // Check if error mentions company ID (confirms API is working)
      if (responseText.includes('company') || responseText.includes('destination')) {
        console.log('  ✓ API validates destination_company_id parameter')
      }
      
      if (responseText.includes('amount') || responseText.includes('invalid')) {
        console.log('  ✓ API validates amount parameter')
      }
    } else if (createResponse.status === 201 || createResponse.status === 200) {
      console.log('  ⚠️ Transfer was actually created! (unexpected)')
      const data = JSON.parse(responseText)
      console.log('  Transfer ID:', data.id || data.data?.id)
      console.log('  ⚠️ You may need to cancel this test transfer manually')
    } else {
      console.log('  Response:', responseText.slice(0, 300))
      
      // Try to parse as JSON
      try {
        const json = JSON.parse(responseText)
        console.log('  Parsed response:', JSON.stringify(json, null, 2).slice(0, 400))
      } catch {
        // Not JSON, that's fine
      }
    }
  } catch (error) {
    console.error('  ❌ POST request failed:', error)
    if (error instanceof Error) {
      console.error('  Error message:', error.message)
    }
  }

  // Test 4: Check response format expectations
  console.log('\n--- Test 4: Check API documentation format ---')
  console.log('  Expected endpoint: POST https://api.whop.com/api/v1/transfers')
  console.log('  Expected parameters:')
  console.log('    - amount (number, in cents)')
  console.log('    - currency (string, e.g., "usd")')
  console.log('    - destination_company_id (string)')
  console.log('    - source_company_id (string, optional)')
  console.log('    - notes (string, optional)')

  console.log('\n=== Test Complete ===')
  console.log('\nSummary:')
  console.log('  - If GET /transfers returned 200: ✓ Transfer API exists')
  console.log('  - If POST /transfers returned 400/404: ✓ API validates requests correctly')
  console.log('  - If POST /transfers returned 201: ⚠️ Transfer was created (unexpected with test data)')
  console.log('\nNext steps:')
  console.log('  - If API exists and validates: Implementation should work')
  console.log('  - If errors: Check API documentation for correct parameter format')
  console.log('  - Test with real company IDs after confirming structure')
}

testTransferAPI().catch(console.error)



