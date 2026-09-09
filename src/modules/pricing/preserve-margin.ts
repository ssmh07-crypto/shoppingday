/** Preserves gross cost/sale ratio; fees and shipping are not included. */
export function preserveMarginPrice(
  oldCost: number | null,
  oldPrice: number | null,
  newCost: number | null,
): number | null {
  if (
    oldCost === null ||
    oldPrice === null ||
    newCost === null ||
    ![oldCost, oldPrice, newCost].every(Number.isFinite) ||
    oldCost <= 0 ||
    oldPrice <= 0 ||
    newCost <= 0 ||
    oldCost === newCost
  )
    return null;
  const result = Math.ceil((newCost * oldPrice) / oldCost / 10) * 10;
  return Number.isSafeInteger(result) && result > 0 && result <= 2147483647
    ? result
    : null;
}
