import "server-only";
import { NaverCommerceError } from "@/modules/channels/naver/naver-commerce-client";
import type { NaverCategoryRepository } from "@/modules/channels/naver/naver-category-repository";
import type { NaverCategoriesClient } from "@/modules/channels/naver/naver-commerce-relay";
import type { NaverRegisteredAttribute } from "./types";

export interface ImportedNaverProductData {
  currentTitle: string;
  categoryId: string;
  category: string;
  attributes: NaverRegisteredAttribute[];
  searchTags: string[];
  materials: string[];
  colors: string[];
  sizes: string[];
  target: string;
  seasons: string[];
}

export interface NaverManagedProductImporter {
  import(channelProductNo: string): Promise<ImportedNaverProductData>;
}

export class CommerceApiManagedProductImporter
  implements NaverManagedProductImporter
{
  constructor(
    private readonly client: NaverCategoriesClient,
    private readonly categories: NaverCategoryRepository,
  ) {}

  async import(channelProductNo: string): Promise<ImportedNaverProductData> {
    const product = await this.client.fetchChannelProduct(channelProductNo);
    const origin = product.originProduct;
    const [attributeDefinitions, attributeValues, categoryRows] =
      await Promise.all([
        this.client.fetchProductAttributes(origin.leafCategoryId),
        this.client.fetchProductAttributeValues(origin.leafCategoryId),
        this.categories.findLeafByIds([origin.leafCategoryId]),
      ]);
    const definitionBySeq = new Map(
      attributeDefinitions.map((item) => [item.attributeSeq, item]),
    );
    const valueByKey = new Map(
      attributeValues.map((item) => [
        `${item.attributeSeq}:${item.attributeValueSeq}`,
        item,
      ]),
    );
    const attributes = origin.detailAttribute.productAttributes.flatMap(
      (selected): NaverRegisteredAttribute[] => {
        const definition = definitionBySeq.get(selected.attributeSeq);
        const metadataValue =
          selected.attributeValueSeq == null
            ? undefined
            : valueByKey.get(
                `${selected.attributeSeq}:${selected.attributeValueSeq}`,
              );
        const value = formatAttributeValue(selected, metadataValue);
        if (!value) return [];
        return [
          {
            attributeSeq: selected.attributeSeq,
            attributeName:
              definition?.attributeName || `속성 ${selected.attributeSeq}`,
            attributeValueSeq: selected.attributeValueSeq ?? null,
            value,
          },
        ];
      },
    );
    const category = categoryRows[0]?.wholeCategoryName ?? origin.leafCategoryId;
    const searchTags = unique(
      origin.detailAttribute.seoInfo?.sellerTags.map((tag) => tag.text) ?? [],
    );

    return {
      currentTitle: origin.name,
      categoryId: origin.leafCategoryId,
      category,
      attributes,
      searchTags,
      materials: valuesFor(attributes, /소재|재질/),
      colors: valuesFor(attributes, /색상|컬러/),
      sizes: valuesFor(attributes, /사이즈|크기|규격/),
      target: valuesFor(attributes, /대상|성별|사용자/)[0] ?? "",
      seasons: valuesFor(attributes, /계절|시즌/),
    };
  }
}

export function naverProductImportErrorMessage(error: unknown) {
  if (!(error instanceof NaverCommerceError)) {
    return "네이버 상품 정보를 불러오지 못했습니다. 직접 입력한 정보로 계속 진행했습니다.";
  }
  if (error.responseStatus === 403 || error.responseStatus === 404) {
    return "현재 커머스 API 계정으로 조회할 수 없는 상품입니다. 본인 스토어 상품인지 확인해 주세요.";
  }
  if (error.code === "authentication_failed") {
    return "네이버 커머스 API 인증에 실패했습니다. 설정의 인증 정보를 확인해 주세요.";
  }
  if (error.code === "ip_not_allowed") {
    return "네이버 커머스 API에 등록된 호출 IP를 확인해 주세요.";
  }
  return "네이버 상품 정보를 불러오지 못했습니다. 직접 입력한 정보로 계속 진행했습니다.";
}

function formatAttributeValue(
  selected: {
    attributeValueSeq?: number | null;
    attributeValueName?: string;
    attributeRealValue?: string | number;
    attributeRealValueUnitCode?: string;
  },
  metadata?: {
    attributeValueName?: string;
    minAttributeValue?: string;
    minAttributeValueUnitCode?: string;
    maxAttributeValue?: string;
    maxAttributeValueUnitCode?: string;
  },
) {
  if (selected.attributeRealValue !== undefined) {
    return `${selected.attributeRealValue}${selected.attributeRealValueUnitCode ?? ""}`;
  }
  if (selected.attributeValueName) return selected.attributeValueName;
  if (metadata?.attributeValueName) return metadata.attributeValueName;
  if (metadata?.minAttributeValue) {
    const minimum = `${metadata.minAttributeValue}${metadata.minAttributeValueUnitCode ?? ""}`;
    const maximum = metadata.maxAttributeValue
      ? `~${metadata.maxAttributeValue}${metadata.maxAttributeValueUnitCode ?? ""}`
      : "";
    return `${minimum}${maximum}`;
  }
  return selected.attributeValueSeq == null
    ? ""
    : `선택값 ${selected.attributeValueSeq}`;
}

function valuesFor(attributes: NaverRegisteredAttribute[], pattern: RegExp) {
  return unique(
    attributes
      .filter((attribute) => pattern.test(attribute.attributeName))
      .map((attribute) => attribute.value),
  );
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
