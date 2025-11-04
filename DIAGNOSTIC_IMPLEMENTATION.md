# Diagnostic Implementation: Access Pass Permission Error

## What Was Implemented

I've added comprehensive diagnostic tools to help identify WHY you're getting the `access_pass:create` permission error, even though the permission is configured and sellers have installed the app.

## Changes Made

### 1. Installation Verification Function (`src/lib/whop.ts`)

Added `verifyAppInstallation()` that checks if your app is properly installed on a seller's company:

```typescript
export async function verifyAppInstallation(companyId: string): Promise<{
  isInstalled: boolean
  hasCreatePermission: boolean
  error?: string
}>
```

**How it works:**
- Lists all experiences on the target company
- Filters for experiences belonging to your app
- Returns whether app is installed

### 2. Pre-Flight Checks in Checkout Routes

Updated both checkout routes to verify installation BEFORE attempting to create access passes:

- `src/app/(whop-api)/api/bets/[id]/checkout/route.ts`
- `src/app/(whop-api)/api/parlays/[id]/checkout/route.ts`

**New flow:**
1. Verify seller is admin ✅
2. **NEW:** Verify app is installed on seller's company ✅
3. Create access pass (only if verification passes)
4. If it still fails, logs will show exact error

### 3. Diagnostic Endpoint (`src/app/(whop-api)/api/check-installation/route.ts`)

New API endpoint sellers can use to check their installation status:

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
  "status": "ready" | "not_installed",
  "message": "...",
  "installUrl": "https://whop.com/apps/app_xxxxx"
}
```

### 4. Enhanced Documentation (`README.md`)

Updated with:
- Clear installation instructions for sellers
- Troubleshooting steps
- Verification methods
- Diagnostic endpoint usage

## How to Use These Diagnostics

### Step 1: Check Installation Status

Have the seller call the diagnostic endpoint:

```bash
curl -H "Authorization: Bearer TOKEN" \
  "https://your-app.com/api/check-installation?experienceId=exp_xxxxx"
```

### Step 2: Try Creating a Bet for Sale

Monitor the server logs for:

```
[checkout] App installation check: {
  sellerCompanyId: 'biz_xxxxx',
  isInstalled: true/false,
  hasCreatePermission: true/false,
  error: '...'
}
```

### Step 3: Interpret the Results

**Scenario A: `isInstalled: false`**
```
[checkout] App installation check: {
  sellerCompanyId: 'biz_Pt2M0VoFmjfq9R',
  isInstalled: false,
  hasCreatePermission: false
}
```

**Diagnosis:** App is NOT installed on seller's company  
**Solution:** Seller needs to install the app and grant `access_pass:create` permission

---

**Scenario B: `isInstalled: true` but still getting permission error**
```
[checkout] App installation check: {
  sellerCompanyId: 'biz_Pt2M0VoFmjfq9R',
  isInstalled: true,
  hasCreatePermission: true
}

[checkout] accessPass creation failed: {
  error: "You do not have permission to perform this action. Required permission: access_pass:create"
}
```

**Diagnosis:** App IS installed, but still failing. This indicates one of:
1. Permission wasn't actually granted during installation (old installation)
2. App configuration in Whop dashboard doesn't properly request the permission
3. API key doesn't have the right scope

**Solutions:**
- Have seller uninstall and reinstall the app (grants fresh permissions)
- Verify in Whop Developer Dashboard that `access_pass:create` is listed in your app's requested permissions
- Check that `WHOP_API_KEY` is the correct app API key (not a personal API key)

## Next Steps Based on Logs

### If Installation Check Shows `isInstalled: false`

This is the most likely scenario. The seller simply hasn't installed the app yet.

**Action:** Send seller the install link and instructions from README.

### If Installation Check Shows `isInstalled: true` But Still Fails

This is more complex. Check:

1. **Verify App Configuration:**
   - Go to https://whop.com/dashboard/developer
   - Find your "Whop Bet Tracker" app
   - Check "Permissions" section
   - Ensure `access_pass:create` is checked/enabled
   - If not, enable it and have sellers reinstall

2. **Verify Seller Granted Permission:**
   - Even if app is installed, seller might have skipped granting the permission
   - Seller should check: Settings → Authorized Apps → Whop Bet Tracker
   - If permission is missing, they need to reinstall

3. **Test with Fresh Installation:**
   - Have a test company uninstall (if installed)
   - Reinstall and carefully note what permissions are requested
   - Verify `access_pass:create` appears in the permission grant screen

## Understanding the Error

The error "You do not have permission to perform this action. Required permission: access_pass:create" can occur at two levels:

1. **App not installed** → Caught by our new verification ✅
2. **App installed but permission not granted** → Will still fail, but logs will clarify

The diagnostic implementation helps you determine which scenario you're in.

## Files Created/Modified

✅ `src/lib/whop.ts` - Added `verifyAppInstallation()`  
✅ `src/app/(whop-api)/api/bets/[id]/checkout/route.ts` - Added pre-flight check  
✅ `src/app/(whop-api)/api/parlays/[id]/checkout/route.ts` - Added pre-flight check  
✅ `src/app/(whop-api)/api/check-installation/route.ts` - NEW diagnostic endpoint  
✅ `README.md` - Enhanced documentation  
✅ `PERMISSION_FIX_GUIDE.md` - Comprehensive troubleshooting guide  
✅ `DIAGNOSTIC_IMPLEMENTATION.md` - This document  

## Summary

🎯 **What This Gives You:**
- Early detection of missing app installations
- Clear error messages for sellers
- Diagnostic tools for troubleshooting
- Better logging for debugging

🔍 **What This Reveals:**
- Whether app is actually installed on seller companies
- Whether the issue is installation vs configuration
- Exact point of failure in the checkout flow

📋 **What You Need to Do:**
1. Run the code and monitor logs
2. Use diagnostic endpoint to check installation status
3. Based on results, either:
   - Have sellers install the app, OR
   - Investigate app configuration/API key issues

The diagnostics will tell you exactly where the problem is! 🚀

