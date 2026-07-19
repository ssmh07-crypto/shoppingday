import "server-only";
import type { SourcingResearchRepository } from "./sourcing-repository";
import { SourcingResearchError } from "./sourcing-errors";
import { sourcingResearchInputSchema } from "./schemas";

export class SourcingResearchService {
  constructor(private readonly repository: SourcingResearchRepository) {}

  list(ownerId: string) {
    return this.repository.list(ownerId);
  }

  async get(ownerId: string, id: string) {
    const row = await this.repository.find(ownerId, id);
    if (!row) {
      throw new SourcingResearchError(
        "not_found",
        "소싱 조사 항목을 찾을 수 없습니다.",
        404,
      );
    }
    return {
      id: row.id,
      status: row.status,
      sourcingKeyword: row.sourcingKeyword,
      monthlySearchVolume: row.monthlySearchVolume,
      sixMonthRevenue: row.sixMonthRevenue,
      marketNotes: row.marketNotes,
      coupangAveragePrice: row.coupangAveragePrice,
      naverAveragePrice: row.naverAveragePrice,
      expectedSellingPrice: row.expectedSellingPrice,
      maximumPurchasePrice: row.maximumPurchasePrice,
      signals: row.signals,
      finalSellingPoint: row.finalSellingPoint,
      positiveReviews: row.positiveReviews,
      negativeReviews: row.negativeReviews,
      customerNeeds: row.customerNeeds,
      productSpecs: row.productSpecs,
      primaryTarget: row.primaryTarget,
      referenceNotes: row.referenceNotes,
      samples: row.samples,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async create(ownerId: string, raw: unknown) {
    const input = sourcingResearchInputSchema.parse(raw);
    const created = await this.repository.create(
      ownerId,
      input,
      calculateMaximumPurchasePrice(input.expectedSellingPrice),
    );
    return this.get(ownerId, created.id);
  }

  async update(ownerId: string, id: string, raw: unknown) {
    const input = sourcingResearchInputSchema.parse(raw);
    const updated = await this.repository.update(
      ownerId,
      id,
      input,
      calculateMaximumPurchasePrice(input.expectedSellingPrice),
    );
    if (!updated) {
      throw new SourcingResearchError(
        "not_found",
        "소싱 조사 항목을 찾을 수 없습니다.",
        404,
      );
    }
    return this.get(ownerId, id);
  }
}

export function calculateMaximumPurchasePrice(
  expectedSellingPrice: number | null,
  targetMarginPercent = 30,
) {
  if (expectedSellingPrice == null) return null;
  return Math.floor(expectedSellingPrice * (1 - targetMarginPercent / 100));
}
