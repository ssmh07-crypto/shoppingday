import "server-only";
import { NaverCommerceError } from "@/modules/channels/naver/naver-commerce-client";
import type { NaverCategoryRepository } from "@/modules/channels/naver/naver-category-repository";
import type { NaverCategoriesClient } from "@/modules/channels/naver/naver-commerce-relay";
import type { NaverProductPayload } from "@/modules/channels/naver/naver-product-payload";
import type {
  ManagedProductSalesSummary,
  NaverRegisteredAttribute,
} from "./types";

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
  salePrice?: number | null;
  stockQuantity?: number | null;
  statusType?: string;
  representativeImageUrl?: string;
}

export interface NaverManagedProductImporter {
  import(
    channelProductNo: string,
    storeConnectionId?: string,
  ): Promise<ImportedNaverProductData>;
}

export interface NaverManagedProductUpdater {
  apply(
    channelProductNo: string,
    input: {
      title: string;
      searchTags: string[];
      salePrice: number;
      stockQuantity: number;
      statusType: "SALE" | "OUTOFSTOCK" | "SUSPENSION";
      naverAttributes: NaverRegisteredAttribute[];
      originProductNo?: string;
    },
    storeConnectionId?: string,
  ): Promise<void>;
}

export interface NaverManagedProductSalesReader {
  summarize(
    channelProductNo: string,
    storeConnectionId?: string,
  ): Promise<ManagedProductSalesSummary>;
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
            minValue:
              selected.attributeRealValue === undefined
                ? metadataValue?.minAttributeValue ?? ""
                : String(selected.attributeRealValue),
            maxValue: metadataValue?.maxAttributeValue ?? "",
            unitCode:
              selected.attributeRealValueUnitCode ??
              metadataValue?.minAttributeValueUnitCode ??
              metadataValue?.maxAttributeValueUnitCode ??
              null,
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
      salePrice: origin.salePrice ?? null,
      stockQuantity: origin.stockQuantity ?? null,
      statusType: origin.statusType ?? "",
      representativeImageUrl:
        origin.images?.representativeImage?.url ?? "",
    };
  }
}

export class CommerceApiManagedProductUpdater
  implements NaverManagedProductUpdater
{
  constructor(private readonly client: NaverCategoriesClient) {}

  async apply(
    channelProductNo: string,
    input: {
      title: string;
      searchTags: string[];
      salePrice: number;
      stockQuantity: number;
      statusType: "SALE" | "OUTOFSTOCK" | "SUSPENSION";
      naverAttributes: NaverRegisteredAttribute[];
      originProductNo?: string;
    },
  ) {
    const product = await this.client.fetchChannelProduct(channelProductNo);
    const originProductNo =
      input.originProductNo ?? product.originProductNo;
    if (
      !originProductNo ||
      !product.smartstoreChannelProduct ||
      typeof product.smartstoreChannelProduct !== "object"
    ) {
      throw new NaverCommerceError(
        "request_failed",
        "네이버 상품 수정에 필요한 원상품 정보를 확인하지 못했습니다.",
      );
    }
    const originProduct = product.originProduct as Record<string, unknown> & {
      detailAttribute: Record<string, unknown> & {
        seoInfo?: Record<string, unknown>;
      };
    };
    const payload = {
      originProduct: {
        ...originProduct,
        name: input.title,
        salePrice: input.salePrice,
        stockQuantity: input.stockQuantity,
        statusType:
          input.statusType === "OUTOFSTOCK" ? "SALE" : input.statusType,
        detailAttribute: {
          ...originProduct.detailAttribute,
          productAttributes: input.naverAttributes.flatMap((attribute) => {
            const realValue =
              attribute.minValue?.trim() || attribute.maxValue?.trim();
            if (attribute.attributeValueSeq == null && !realValue) return [];
            return [
              {
                attributeSeq: attribute.attributeSeq,
                attributeValueSeq: attribute.attributeValueSeq,
                ...(realValue
                  ? {
                      attributeRealValue: realValue,
                      ...(attribute.unitCode
                        ? {
                            attributeRealValueUnitCode:
                              attribute.unitCode,
                          }
                        : {}),
                    }
                  : {}),
              },
            ];
          }),
          seoInfo: {
            ...(originProduct.detailAttribute.seoInfo ?? {}),
            sellerTags: input.searchTags.map((text) => ({ text })),
          },
        },
      },
      smartstoreChannelProduct: product.smartstoreChannelProduct,
    } as unknown as NaverProductPayload;
    await this.client.updateProduct(originProductNo, payload);
  }
}

export class CommerceApiManagedProductSalesReader
  implements NaverManagedProductSalesReader
{
  constructor(
    private readonly client: NaverCategoriesClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async summarize(
    channelProductNo: string,
  ): Promise<ManagedProductSalesSummary> {
    if (
      !this.client.fetchLastChangedProductOrders ||
      !this.client.fetchProductOrders
    ) {
      throw new NaverCommerceError(
        "not_configured",
        "네이버 주문 조회 기능이 설정되지 않았습니다.",
      );
    }
    const now = this.now();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60_000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
    const productOrderIds = new Set<string>();
    const windows = Array.from({ length: 30 }, (_, index) => {
      const start = new Date(
        thirtyDaysAgo.getTime() + index * 24 * 60 * 60_000,
      );
      return {
        start,
        end: new Date(
          Math.min(start.getTime() + 24 * 60 * 60_000, now.getTime()),
        ),
      };
    });
    await Promise.all(
      Array.from({ length: 3 }, async (_, worker) => {
        for (
          let windowIndex = worker;
          windowIndex < windows.length;
          windowIndex += 3
        ) {
          const window = windows[windowIndex]!;
          let cursorFrom = window.start.toISOString();
          let moreSequence: string | undefined;
          for (let page = 0; page < 100; page += 1) {
            const result = await this.client.fetchLastChangedProductOrders!({
              lastChangedFrom: cursorFrom,
              lastChangedTo: window.end.toISOString(),
              ...(moreSequence ? { moreSequence } : {}),
            });
            result.productOrderIds.forEach((id) => productOrderIds.add(id));
            if (!result.more) break;
            cursorFrom = result.more.moreFrom;
            moreSequence = result.more.moreSequence;
          }
        }
      }),
    );

    let sevenDays = 0;
    let thirtyDays = 0;
    const ids = [...productOrderIds];
    for (let index = 0; index < ids.length; index += 300) {
      const rows = await this.client.fetchProductOrders(
        ids.slice(index, index + 300),
      );
      for (const row of rows) {
        const order = row.productOrder;
        const paidAt = row.order.paymentDate
          ? new Date(row.order.paymentDate)
          : null;
        if (
          order.productId !== channelProductNo ||
          !paidAt ||
          Number.isNaN(paidAt.getTime()) ||
          [
            "PAYMENT_WAITING",
            "CANCELED",
            "RETURNED",
            "CANCELED_BY_NOPAYMENT",
          ].includes(order.productOrderStatus)
        ) {
          continue;
        }
        const quantity = order.remainQuantity ?? order.quantity;
        if (paidAt >= thirtyDaysAgo) thirtyDays += quantity;
        if (paidAt >= sevenDaysAgo) sevenDays += quantity;
      }
    }

    return {
      sevenDays,
      thirtyDays,
      fetchedAt: now.toISOString(),
      source: "naver_orders",
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
