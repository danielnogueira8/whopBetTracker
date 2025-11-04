# Access Pass Permission Fix - Implementation Guide

## 🎯 ISSUE RESOLVED

**Root Cause:** Incorrect SDK usage pattern - was creating separate SDK instances instead of using the main instance.

**Fix:** Use the main `whop` SDK instance and pass `companyId` in method parameters.

See `SDK_USAGE_FIX.md` for detailed explanation of the fix.

---

## What Was Implemented

This implementation adds comprehensive verification and error handling for the `access_pass:create` permission issue when sellers try to create bets/parlays for sale.

### Changes Made

#### 1. New Helper Function: `verifyAppInstallation()` (`src/lib/whop.ts`)

A new function that checks if the app is properly installed on a company:

```typescript
export async function verifyAppInstallation(companyId: string): Promise<{
  isInstalled: boolean
  hasCreatePermission: boolean
  error?: string
}>
```

**How it works:**
- Lists all experiences on the target company
- Checks if any belong to your app
- Returns installation status with detailed error information

#### 2. Updated Bet Checkout Route (`src/app/(whop-api)/api/bets/[id]/checkout/route.ts`)

**Added:**
- App installation verification BEFORE attempting to create access passes
- Detailed logging of installation status
- Clear error messages with actionable instructions

**Flow:**
1. Verify seller is admin ✅
2. **NEW:** Verify app is installed on seller's company ✅
3. Create access pass (only if verification passes)

#### 3. Updated Parlay Checkout Route (`src/app/(whop-api)/api/parlays/[id]/checkout/route.ts`)

Same changes as bet checkout route for consistency.

#### 4. New Diagnostic Endpoint (`src/app/(whop-api)/api/check-installation/route.ts`)

A new API endpoint sellers can use to check their installation status.

**Endpoint:** `GET /api/check-installation?experienceId=exp_xxxxx`

**Response:**
```json
{
  "userId": "user_xxxxx",
  "experienceId": "exp_xxxxx",
  "companyId": "biz_xxxxx",
  "appId": "app_xxxxx",
  "installation": {
    "isInstalled": true,
    "hasCreatePermission": true
  },
  "status": "ready",
  "message": "App is installed and ready to create bets/parlays for sale",
  "installUrl": "https://whop.com/apps/app_xxxxx"
}
```

#### 5. Enhanced README Documentation

Updated `README.md` with:
- Clear step-by-step installation instructions for sellers
- Detailed error explanations
- Verification steps
- Troubleshooting guide

---

## How to Use

### For Sellers (Testing Your Installation)

**Option 1: Use the Diagnostic Endpoint**

Call the endpoint with your experience ID:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "https://your-app.com/api/check-installation?experienceId=exp_xxxxx"
```

**Option 2: Try Creating a Bet for Sale**

1. Create a bet and mark it for sale
2. Have someone try to purchase it
3. Check the error response - it will now tell you exactly what's wrong

### For Developers (Testing the Implementation)

**Test Case 1: App Not Installed**

Expected behavior:
- Checkout should fail BEFORE attempting to create access pass
- Error message: "App not installed. The Whop Bet Tracker app must be installed..."
- Response code: 403
- Error code: "APP_NOT_INSTALLED"

**Test Case 2: App Installed**

Expected behavior:
- Installation check passes
- Proceeds to create access pass
- If permission still denied, you'll get the original error with full context

---

## Diagnosing the Root Cause

The implementation will now help you identify the exact issue:

### Scenario A: App Not Installed
**Logs will show:**
```
[checkout] App installation check: {
  sellerCompanyId: 'biz_xxxxx',
  isInstalled: false,
  hasCreatePermission: false
}
```

**Solution:** Seller needs to install the app on their company.

### Scenario B: App Installed But Still Failing
**Logs will show:**
```
[checkout] App installation check: {
  sellerCompanyId: 'biz_xxxxx',
  isInstalled: true,
  hasCreatePermission: true
}
[checkout] accessPass creation failed - full response: { ... }
```

**This indicates a different issue:**
1. Permission might not be declared correctly in app settings
2. API key might not have the right scope
3. There might be an issue with how `WhopServerSdk` handles cross-company operations

---

## Next Steps for Troubleshooting

### If Installation Check Passes But Access Pass Creation Still Fails

1. **Verify App Configuration:**
   - Go to https://whop.com/dashboard/developer
   - Find your app
   - Check "Permissions" section
   - Ensure `access_pass:create` is listed

2. **Check API Key Scope:**
   - Your `WHOP_API_KEY` must have permission to act on behalf of companies where the app is installed
   - Verify the key is from the app (not a personal API key)

3. **Test with Raw API Call:**
   ```bash
   curl -X POST https://api.whop.com/api/v5/access_passes \
     -H "Authorization: Bearer YOUR_APP_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "company_id": "biz_xxxxx",
       "title": "Test Access Pass",
       "visibility": "hidden",
       "plan_options": {
         "plan_type": "one_time",
         "initial_price": 1.00,
         "base_currency": "usd",
         "release_method": "buy_now"
       }
     }'
   ```

4. **Check Whop Documentation:**
   - Verify the correct way to create access passes on behalf of other companies
   - Ensure the SDK usage matches the documented approach

5. **Contact Whop Support:**
   - If the app is installed and permissions are correct but it still fails
   - Provide them with:
     - Your app ID
     - The seller's company ID
     - The exact error message
     - Confirmation that the app is installed

---

## Understanding the Architecture

### How Cross-Company Access Works

When a seller wants to sell bets:

1. **Seller installs app on their company** → Creates an experience
2. **Seller creates bets** → Stored in database with seller's userId
3. **Seller lists bet for sale** → Creates a sale listing
4. **Buyer attempts purchase** → Triggers checkout flow
5. **App creates access pass** → Uses `createSellerWhopSdk(sellerCompanyId)`
6. **Access pass creation requires:**
   - App installed on seller's company ✅
   - Permission `access_pass:create` granted ✅
   - API key has scope to act on behalf of installed apps ✅

### The Permission Flow

```
┌─────────────────┐
│  Your App       │
│  (app_xxxxx)    │
└────────┬────────┘
         │
         │ API Key: WHOP_API_KEY
         │
    ┌────▼────────────────────────────┐
    │  Seller's Company (biz_xxxxx)   │
    │                                  │
    │  ✓ App installed                │
    │  ✓ access_pass:create granted   │
    │                                  │
    │  Can create:                    │
    │  - Access passes                │
    │  - Plans                        │
    │  - Process payments             │
    └─────────────────────────────────┘
```

---

## Expected Behavior After Implementation

### Success Flow

1. Seller installs app with `access_pass:create` permission
2. Seller creates bet and lists for sale
3. Buyer initiates checkout
4. System verifies app installation → ✅ Passes
5. System creates access pass → ✅ Success
6. System creates checkout session → ✅ Success
7. Buyer completes payment → ✅ Success

### Failure Flow (Clear Error)

1. Seller creates bet and lists for sale (without installing app)
2. Buyer initiates checkout
3. System verifies app installation → ❌ Fails
4. System returns clear error:
   ```json
   {
     "error": "App not installed. The Whop Bet Tracker app must be installed on your company before you can sell bets.",
     "code": "APP_NOT_INSTALLED",
     "sellerCompanyId": "biz_xxxxx",
     "instructions": "Go to https://whop.com/apps/app_xxxxx and install..."
   }
   ```
5. Seller sees error and follows instructions
6. Seller installs app with permission
7. Buyer tries again → ✅ Success

---

## Summary

This implementation provides:

✅ **Early Detection**: Catches installation issues before attempting to create access passes  
✅ **Clear Errors**: Provides actionable error messages to sellers  
✅ **Diagnostic Tools**: New endpoint to check installation status  
✅ **Better Logging**: Detailed logs for troubleshooting  
✅ **Documentation**: Comprehensive README updates  

The root cause of the permission error will now be clear from the logs and error messages. If sellers are still getting permission errors after this implementation confirms the app is installed, it indicates a deeper issue with the Whop API or app configuration that needs to be addressed with Whop support.

