import { NextRequest, NextResponse } from 'next/server'
import { verifyUserToken } from '@whop/api'
import { whop } from '~/lib/whop'

export async function GET(req: NextRequest) {
  try {
    const { userId } = await verifyUserToken(req.headers)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Inspect whop object structure
    const inspection: Record<string, any> = {
      timestamp: new Date().toISOString(),
      whopObjectKeys: Object.keys(whop),
    }

    // Check if transfers exists
    inspection.transfers = {
      exists: 'transfers' in whop,
      type: typeof (whop as any).transfers,
      value: (whop as any).transfers ? 'defined' : 'undefined',
    }

    // If transfers exists, inspect its methods
    if ((whop as any).transfers) {
      inspection.transfers.methods = Object.keys((whop as any).transfers)
      inspection.transfers.createTransfer = {
        exists: typeof (whop as any).transfers?.createTransfer === 'function',
        type: typeof (whop as any).transfers?.createTransfer,
      }
    }

    // Check other common properties to understand structure
    inspection.properties = {
      payments: 'payments' in whop ? Object.keys((whop as any).payments || {}) : null,
      companies: 'companies' in whop ? Object.keys((whop as any).companies || {}) : null,
      experiences: 'experiences' in whop ? Object.keys((whop as any).experiences || {}) : null,
      users: 'users' in whop ? Object.keys((whop as any).users || {}) : null,
      access: 'access' in whop ? Object.keys((whop as any).access || {}) : null,
    }

    // Try to inspect the full whop object structure (safely)
    inspection.fullStructure = {}
    for (const key of Object.keys(whop)) {
      const value = (whop as any)[key]
      inspection.fullStructure[key] = {
        type: typeof value,
        isObject: typeof value === 'object' && value !== null,
        methods: typeof value === 'object' && value !== null ? Object.keys(value) : null,
      }
    }

    return NextResponse.json({ inspection }, { status: 200 })
  } catch (error) {
    return NextResponse.json({ 
      error: 'Failed to inspect', 
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 })
  }
}


