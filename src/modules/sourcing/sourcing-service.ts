import "server-only";
import type { SourcingResearchRepository } from "./sourcing-repository";
import { SourcingResearchError } from "./sourcing-errors";
import { sourcingResearchInputSchema } from "./schemas";
import { buildSourcingRegistrationDraft } from "./registration-draft";

export class SourcingResearchService {
  constructor(private readonly repository: SourcingResearchRepository) {}

  list(ownerId: string) {
    return this.repository.list(ownerId);
  }

  listRegistrations(ownerId: string) {
    return this.repository.listRegistrations(ownerId);
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
      registrationProductId: row.registrationProductId,
      signals: row.signals,
      finalSellingPoint: row.finalSellingPoint,
      positiveReviews: row.positiveReviews,
      negativeReviews: row.negativeReviews,
      customerNeeds: row.customerNeeds,
      productSpecs: row.productSpecs,
      primaryTarget: row.primaryTarget,
      referenceNotes: row.referenceNotes,
      reviewEntries: row.reviewEntries,
      relatedKeywords: row.relatedKeywords,
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
    const registrationDraft = buildSourcingRegistrationInput(input);
    const updated = await this.repository.update(
      ownerId,
      id,
      input,
      calculateMaximumPurchasePrice(input.expectedSellingPrice),
      registrationDraft,
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

  async createRegistrationProduct(ownerId: string, id: string) {
    const research = await this.get(ownerId, id);
    if (!research.sourcingKeyword.trim()) {
      throw new SourcingResearchError(
        "registration_not_ready",
        "상품 등록 준비를 시작하려면 소싱 키워드를 입력해 주세요.",
        422,
      );
    }
    const result = await this.repository.createRegistrationProduct(
      ownerId,
      id,
      buildSourcingRegistrationInput(research),
    );
    if (!result) {
      throw new SourcingResearchError(
        "not_found",
        "소싱 조사 항목을 찾을 수 없습니다.",
        404,
      );
    }
    return result;
  }
}

function buildSourcingRegistrationInput(
  research: Pick<
    import("./types").SourcingResearchInput,
    "sourcingKeyword" | "relatedKeywords" | "expectedSellingPrice" | "samples"
  >,
) {
  const draft = buildSourcingRegistrationDraft(
    research.sourcingKeyword,
    research.relatedKeywords,
  );
  const supplierPrices = research.samples
    .map((sample) => sample.price)
    .filter((price): price is number => price !== null);
  return {
    title: draft.title,
    searchTags: draft.searchTags,
    sellingPrice: research.expectedSellingPrice,
    originalName: research.sourcingKeyword,
    supplierPrice: supplierPrices.length ? Math.min(...supplierPrices) : null,
  };
}

export function calculateMaximumPurchasePrice(
  expectedSellingPrice: number | null,
  targetMarginPercent = 30,
) {
  if (expectedSellingPrice == null) return null;
  return Math.floor(expectedSellingPrice * (1 - targetMarginPercent / 100));
}
