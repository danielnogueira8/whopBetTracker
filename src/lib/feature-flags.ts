export function isSellingDisabled(): boolean {
  const v = process.env.NEXT_PUBLIC_DISABLE_SELLING
  return v === '1' || v === 'true' || v === 'yes'
}




