# SDK Usage Fix - Access Pass Creation

## The Problem

Even though sellers had installed the app and granted the `access_pass:create` permission, access pass creation was still failing with:

```
Error: You do not have permission to perform this action. Required permission: access_pass:create
```

## The Root Cause

The issue was in how we were using the `WhopServerSdk`. We were creating separate SDK instances for each seller company:

### ❌ Incorrect Pattern (Before):

```typescript
// Creating a separate SDK instance
const sellerWhop = createSellerWhopSdk(sellerCompanyId)

// Using the separate instance
await sellerWhop.accessPasses.createAccessPass({
  companyId: sellerCompanyId,
  // ...
})
```

**Why this failed:**
- Creating a new SDK instance with a different `companyId` doesn't automatically give it the permissions
- The SDK instance is tied to the configuration it was created with
- Each instance uses its own context and doesn't inherit cross-company permissions

## The Fix

Use the main SDK instance and let the `companyId` parameter in the method call handle the routing:

### ✅ Correct Pattern (After):

```typescript
// Use the main SDK instance that was initialized with app credentials
await whop.accessPasses.createAccessPass({
  companyId: sellerCompanyId,  // Just pass the target company ID
  // ...
})
```

**Why this works:**
- The main `whop` SDK instance has the app's credentials
- When you pass `companyId` in the method call, the SDK creates the resource on that company
- The SDK automatically uses the app's granted permissions on that company
- This is the intended pattern for multi-company apps

## What Changed

### File: `src/app/(whop-api)/api/bets/[id]/checkout/route.ts`

**Removed:**
```typescript
const sellerWhop = createSellerWhopSdk(sellerCompanyId)
await sellerWhop.accessPasses.createAccessPass({ ... })
```

**Changed to:**
```typescript
await whop.accessPasses.createAccessPass({
  companyId: sellerCompanyId,
  // ...
})
```

### File: `src/app/(whop-api)/api/parlays/[id]/checkout/route.ts`

Same change as the bets route.

### File: `src/lib/whop.ts`

The `createSellerWhopSdk()` function is still there but no longer used. It can be removed in future cleanup.

## How to Test

1. **Ensure app is installed** on seller's company with `access_pass:create` permission
2. **Create a bet** and list it for sale
3. **Try to purchase** the bet
4. **Access pass should be created successfully** on the seller's company

### Expected Logs:

```
[checkout] App installation check: {
  sellerCompanyId: 'biz_xxxxx',
  isInstalled: true,
  hasCreatePermission: true
}

[checkout] Creating access pass with params: {
  sellerCompanyId: 'biz_xxxxx',
  experienceId: 'exp_xxxxx',
  priceInDollars: 4.99,
  baseCurrency: 'usd'
}

✅ Access pass created successfully
```

## Key Takeaway

**The WhopServerSdk is designed to use a single instance with app credentials.** When you need to create resources on different companies:

1. ✅ **DO**: Use the main SDK instance and pass `companyId` in method parameters
2. ❌ **DON'T**: Create separate SDK instances for each company

This pattern works for all SDK methods that accept a `companyId` parameter:
- `whop.accessPasses.createAccessPass({ companyId, ... })`
- `whop.experiences.createExperience({ companyId, ... })`
- `whop.companies.listMembers({ companyId, ... })`
- etc.

## Documentation

The Whop SDK uses app-level credentials that are granted permissions when users install your app. The SDK automatically handles the authorization for operations on companies where your app is installed, as long as:

1. The app is installed on that company
2. The required permissions were granted during installation
3. You pass the correct `companyId` in your method calls

No need to create separate SDK instances per company!

