import { sanitizeDescription } from "@/modules/products/product-domain";

export type SupplierChangeKind = "sold_out" | "discontinued" | "description";

export function supplierChangeTargets(input: {
  previousAvailability: string;
  availability: string;
  previousDescription: string | null;
  description: string | null;
  editedDescription: string;
}): { kind: SupplierChangeKind; previousValue: string; targetValue: string }[] {
  const targets: ReturnType<typeof supplierChangeTargets> = [];
  if (
    input.previousAvailability !== input.availability &&
    (input.availability === "sold_out" || input.availability === "discontinued")
  ) {
    targets.push({
      kind: input.availability,
      previousValue: input.previousAvailability,
      targetValue: input.availability,
    });
  }
  const previousValue = sanitizeDescription(input.previousDescription ?? "");
  const targetValue = sanitizeDescription(input.description ?? "");
  if (
    previousValue &&
    targetValue &&
    previousValue !== targetValue &&
    input.editedDescription === previousValue
  ) {
    targets.push({ kind: "description", previousValue, targetValue });
  }
  return targets;
}

export function enabledChangeKinds(input: {
  applySoldOut?: boolean;
  applyDiscontinued?: boolean;
  applyDescriptions?: boolean;
}): SupplierChangeKind[] {
  return [
    input.applySoldOut ? "sold_out" : null,
    input.applyDiscontinued ? "discontinued" : null,
    input.applyDescriptions ? "description" : null,
  ].filter((kind): kind is SupplierChangeKind => kind !== null);
}
