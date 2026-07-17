import { createHash } from "node:crypto";
import type {
  EditedOptions,
  NaverProductAttribute,
  SelectedImage,
} from "@/lib/db/schema";

type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type NaverProductPayloadSource = {
  sellerManagementCode: string;
  title: string;
  sellingPrice: number | null;
  description: string;
  naverCategoryId: string | null;
  searchTags: string[];
  selectedImages: SelectedImage[];
  editedOptions: EditedOptions;
  naverAttributes: NaverProductAttribute[];
};

export type NaverPublicationProfile = {
  singleStockQuantity?: number;
  deliveryInfo?: JsonObject;
  afterServiceInfo?: {
    afterServiceTelephoneNumber: string;
    afterServiceGuideContent: string;
  };
  originAreaInfo?: {
    originAreaCode: "00" | "01" | "02" | "03" | "04" | "05";
    importer?: string;
    content?: string;
    plural: boolean;
  };
  productInfoProvidedNotice?: JsonObject & {
    productInfoProvidedNoticeType: string;
  };
  taxType?: "TAX" | "DUTYFREE" | "SMALL";
  minorPurchasable?: boolean;
  naverShoppingRegistration?: boolean;
  channelProductDisplayStatusType?: "ON" | "SUSPENSION";
};

export type NaverProductPayloadIssue = {
  path: string;
  code: "required" | "invalid" | "unsupported";
  message: string;
};

export type NaverProductPayload = {
  originProduct: {
    statusType: "SALE";
    saleType: "NEW";
    leafCategoryId: string;
    name: string;
    detailContent: string;
    images: {
      representativeImage: { url: string };
      optionalImages: Array<{ url: string }>;
    };
    salePrice: number;
    stockQuantity: number;
    deliveryInfo: JsonObject;
    detailAttribute: {
      afterServiceInfo: NonNullable<
        NaverPublicationProfile["afterServiceInfo"]
      >;
      originAreaInfo: NonNullable<NaverPublicationProfile["originAreaInfo"]>;
      sellerCodeInfo: { sellerManagementCode: string };
      optionInfo?: NaverOptionInfo;
      productAttributes: NaverPayloadAttribute[];
      productInfoProvidedNotice: NonNullable<
        NaverPublicationProfile["productInfoProvidedNotice"]
      >;
      taxType: NonNullable<NaverPublicationProfile["taxType"]>;
      minorPurchasable: boolean;
      seoInfo?: { sellerTags: Array<{ text: string }> };
    };
  };
  smartstoreChannelProduct: {
    naverShoppingRegistration: boolean;
    channelProductDisplayStatusType: "ON" | "SUSPENSION";
  };
};

type NaverPayloadAttribute = {
  attributeSeq: number;
  attributeValueSeq: number;
};

type NaverOptionInfo = {
  optionCombinationSortType: "CREATE";
  optionCombinationGroupNames: {
    optionGroupName1: string;
    optionGroupName2?: string;
    optionGroupName3?: string;
  };
  optionCombinations: Array<{
    stockQuantity: number;
    price: number;
    usable: true;
    optionName1: string;
    optionName2?: string;
    optionName3?: string;
    sellerManagerCode?: string;
  }>;
  useStockManagement: true;
};

export type NaverProductPayloadResult =
  | { ok: true; payload: NaverProductPayload; hash: string }
  | { ok: false; issues: NaverProductPayloadIssue[] };

const MAX_PRICE = 999_999_990;
const MAX_STOCK = 99_999_999;
const NOTICE_TYPES = new Set([
  "WEAR",
  "SHOES",
  "BAG",
  "FASHION_ITEMS",
  "SLEEPING_GEAR",
  "FURNITURE",
  "IMAGE_APPLIANCES",
  "HOME_APPLIANCES",
  "SEASON_APPLIANCES",
  "OFFICE_APPLIANCES",
  "OPTICS_APPLIANCES",
  "MICROELECTRONICS",
  "CELLPHONE",
  "NAVIGATION",
  "CAR_ARTICLES",
  "MEDICAL_APPLIANCES",
  "KITCHEN_UTENSILS",
  "COSMETIC",
  "JEWELLERY",
  "FOOD",
  "GENERAL_FOOD",
  "DIET_FOOD",
  "KIDS",
  "MUSICAL_INSTRUMENT",
  "SPORTS_EQUIPMENT",
  "BOOKS",
  "LODGMENT_RESERVATION",
  "TRAVEL_PACKAGE",
  "AIRLINE_TICKET",
  "RENT_CAR",
  "RENTAL_HA",
  "RENTAL_ETC",
  "DIGITAL_CONTENTS",
  "GIFT_CARD",
  "MOBILE_COUPON",
  "MOVIE_SHOW",
  "ETC_SERVICE",
  "BIOCHEMISTRY",
  "BIOCIDAL",
  "ETC",
]);

export function buildNaverProductPayload(
  source: NaverProductPayloadSource,
  profile: NaverPublicationProfile,
): NaverProductPayloadResult {
  const issues: NaverProductPayloadIssue[] = [];
  const required = <T>(
    value: T | null | undefined,
    path: string,
    message: string,
  ): value is T => {
    if (value !== null && value !== undefined && value !== "") return true;
    issues.push({ path, code: "required", message });
    return false;
  };

  required(source.title.trim(), "originProduct.name", "상품명이 필요합니다.");
  if (
    !source.sellingPrice ||
    !Number.isInteger(source.sellingPrice) ||
    source.sellingPrice > MAX_PRICE
  ) {
    issues.push({
      path: "originProduct.salePrice",
      code: "invalid",
      message: "판매가는 1원 이상 999,999,990원 이하의 정수여야 합니다.",
    });
  }
  required(
    source.description.trim(),
    "originProduct.detailContent",
    "상품 상세 정보가 필요합니다.",
  );
  if (!source.naverCategoryId || !/^\d+$/.test(source.naverCategoryId)) {
    issues.push({
      path: "originProduct.leafCategoryId",
      code: "required",
      message: "네이버 최종 카테고리가 필요합니다.",
    });
  }
  required(
    source.sellerManagementCode.trim(),
    "originProduct.detailAttribute.sellerCodeInfo.sellerManagementCode",
    "판매자 관리 코드가 필요합니다.",
  );

  const images = mapImages(source.selectedImages, issues);
  const attributes = mapAttributes(source.naverAttributes, issues);
  const options = mapOptions(source.editedOptions, issues);
  const stockQuantity = options
    ? options.optionCombinations.reduce(
        (total, option) => total + option.stockQuantity,
        0,
      )
    : profile.singleStockQuantity;
  if (
    stockQuantity === undefined ||
    !Number.isInteger(stockQuantity) ||
    stockQuantity < 0 ||
    stockQuantity > MAX_STOCK
  ) {
    issues.push({
      path: "originProduct.stockQuantity",
      code: stockQuantity === undefined ? "required" : "invalid",
      message: "재고는 0 이상 99,999,999 이하의 정수여야 합니다.",
    });
  }

  required(
    profile.deliveryInfo,
    "originProduct.deliveryInfo",
    "배송 정책이 필요합니다.",
  );
  validateDeliveryInfo(profile.deliveryInfo, issues);
  required(
    profile.afterServiceInfo,
    "originProduct.detailAttribute.afterServiceInfo",
    "A/S 연락처와 안내가 필요합니다.",
  );
  validateAfterServiceInfo(profile.afterServiceInfo, issues);
  required(
    profile.originAreaInfo,
    "originProduct.detailAttribute.originAreaInfo",
    "원산지 정보가 필요합니다.",
  );
  validateOriginArea(profile.originAreaInfo, issues);
  required(
    profile.productInfoProvidedNotice,
    "originProduct.detailAttribute.productInfoProvidedNotice",
    "상품정보제공고시가 필요합니다.",
  );
  validateProvidedNotice(profile.productInfoProvidedNotice, issues);
  required(
    profile.taxType,
    "originProduct.detailAttribute.taxType",
    "부가가치세 유형이 필요합니다.",
  );
  required(
    profile.minorPurchasable,
    "originProduct.detailAttribute.minorPurchasable",
    "미성년자 구매 가능 여부를 선택해야 합니다.",
  );
  required(
    profile.naverShoppingRegistration,
    "smartstoreChannelProduct.naverShoppingRegistration",
    "네이버 쇼핑 등록 여부를 선택해야 합니다.",
  );
  required(
    profile.channelProductDisplayStatusType,
    "smartstoreChannelProduct.channelProductDisplayStatusType",
    "채널 상품 전시 상태가 필요합니다.",
  );

  if (issues.length) return { ok: false, issues };

  const payload: NaverProductPayload = {
    originProduct: {
      statusType: "SALE",
      saleType: "NEW",
      leafCategoryId: source.naverCategoryId!,
      name: source.title.trim(),
      detailContent: source.description,
      images: images!,
      salePrice: source.sellingPrice!,
      stockQuantity: stockQuantity!,
      deliveryInfo: profile.deliveryInfo!,
      detailAttribute: {
        afterServiceInfo: profile.afterServiceInfo!,
        originAreaInfo: profile.originAreaInfo!,
        sellerCodeInfo: {
          sellerManagementCode: source.sellerManagementCode.trim(),
        },
        ...(options ? { optionInfo: options } : {}),
        productAttributes: attributes,
        productInfoProvidedNotice: profile.productInfoProvidedNotice!,
        taxType: profile.taxType!,
        minorPurchasable: profile.minorPurchasable!,
        ...(source.searchTags.length
          ? {
              seoInfo: {
                sellerTags: source.searchTags.map((text) => ({ text })),
              },
            }
          : {}),
      },
    },
    smartstoreChannelProduct: {
      naverShoppingRegistration: profile.naverShoppingRegistration!,
      channelProductDisplayStatusType: profile.channelProductDisplayStatusType!,
    },
  };
  return { ok: true, payload, hash: hashNaverProductPayload(payload) };
}

export function hashNaverProductPayload(payload: NaverProductPayload) {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

function mapImages(
  selectedImages: SelectedImage[],
  issues: NaverProductPayloadIssue[],
) {
  const enabled = selectedImages
    .filter((image) => image.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const primary = enabled.find((image) => image.isPrimary);
  if (enabled.filter((image) => image.isPrimary).length !== 1) {
    issues.push({
      path: "originProduct.images.representativeImage",
      code: primary ? "invalid" : "required",
      message: "활성 대표 이미지를 정확히 하나 지정해야 합니다.",
    });
  }
  enabled.slice(0, 10).forEach((image, index) => {
    if (!image.storedUrl) {
      issues.push({
        path: `originProduct.images.${image.isPrimary ? "representativeImage" : `optionalImages.${index}`}.url`,
        code: "required",
        message: "네이버 이미지 업로드 URL이 필요합니다.",
      });
    }
  });
  if (enabled.length > 10) {
    issues.push({
      path: "originProduct.images.optionalImages",
      code: "invalid",
      message: "대표 이미지를 포함해 최대 10개까지 등록할 수 있습니다.",
    });
  }
  if (
    !primary?.storedUrl ||
    issues.some((issue) => issue.path.startsWith("originProduct.images"))
  ) {
    return undefined;
  }
  return {
    representativeImage: { url: primary.storedUrl },
    optionalImages: enabled
      .filter((image) => image.id !== primary.id)
      .map((image) => ({ url: image.storedUrl! })),
  };
}

function mapAttributes(
  attributes: NaverProductAttribute[],
  issues: NaverProductPayloadIssue[],
) {
  return attributes.flatMap((attribute, index) => {
    if (attribute.attributeValueSeq === null) {
      issues.push({
        path: `originProduct.detailAttribute.productAttributes.${index}.attributeValueSeq`,
        code: "unsupported",
        message:
          "네이버 등록 API에는 속성값 ID가 필요합니다. 카테고리의 표준 속성값을 다시 선택해 주세요.",
      });
      return [];
    }
    return [
      {
        attributeSeq: attribute.attributeSeq,
        attributeValueSeq: attribute.attributeValueSeq,
      },
    ];
  });
}

function mapOptions(
  editedOptions: EditedOptions,
  issues: NaverProductPayloadIssue[],
): NaverOptionInfo | undefined {
  if (!editedOptions.groups.length) return undefined;
  const groups = editedOptions.groups.map((group) => ({
    ...group,
    values: group.values.filter((value) => value.enabled),
  }));
  if (groups.length > 3) {
    issues.push({
      path: "originProduct.detailAttribute.optionInfo.optionCombinationGroupNames",
      code: "unsupported",
      message: "네이버 조합형 옵션은 최대 3개 그룹까지 지원합니다.",
    });
  }
  groups.forEach((group, index) => {
    if (!group.values.length) {
      issues.push({
        path: `originProduct.detailAttribute.optionInfo.optionCombinationGroupNames.optionGroupName${index + 1}`,
        code: "invalid",
        message: `${group.name} 그룹에 활성 옵션값이 없습니다.`,
      });
    }
  });
  const valueLocations = new Map<
    string,
    { groupIndex: number; name: string }
  >();
  groups.forEach((group, groupIndex) =>
    group.values.forEach((value) =>
      valueLocations.set(value.id, { groupIndex, name: value.name }),
    ),
  );
  const enabledCombinations = editedOptions.combinations.filter(
    (combination) => combination.enabled,
  );
  if (!enabledCombinations.length) {
    issues.push({
      path: "originProduct.detailAttribute.optionInfo.optionCombinations",
      code: "required",
      message: "활성 옵션 조합이 필요합니다.",
    });
  }
  const combinations = enabledCombinations.flatMap((combination, index) => {
    const names: Array<string | undefined> = Array(groups.length).fill(
      undefined,
    );
    let invalidCombination = combination.valueIds.length !== groups.length;
    combination.valueIds.forEach((valueId) => {
      const location = valueLocations.get(valueId);
      if (!location || names[location.groupIndex]) {
        invalidCombination = true;
        return;
      }
      names[location.groupIndex] = location.name;
    });
    if (invalidCombination || names.some((name) => !name)) {
      issues.push({
        path: `originProduct.detailAttribute.optionInfo.optionCombinations.${index}`,
        code: "invalid",
        message: "옵션 조합은 각 활성 그룹의 옵션값을 하나씩 포함해야 합니다.",
      });
      return [];
    }
    if (
      !Number.isInteger(combination.stock) ||
      combination.stock < 0 ||
      combination.stock > MAX_STOCK
    ) {
      issues.push({
        path: `originProduct.detailAttribute.optionInfo.optionCombinations.${index}.stockQuantity`,
        code: "invalid",
        message: "옵션 재고가 허용 범위를 벗어났습니다.",
      });
    }
    if (
      !Number.isInteger(combination.additionalPrice) ||
      Math.abs(combination.additionalPrice) > MAX_PRICE
    ) {
      issues.push({
        path: `originProduct.detailAttribute.optionInfo.optionCombinations.${index}.price`,
        code: "invalid",
        message: "옵션 추가금이 허용 범위를 벗어났습니다.",
      });
    }
    return [
      {
        stockQuantity: combination.stock,
        price: combination.additionalPrice,
        usable: true as const,
        optionName1: names[0]!,
        ...(names[1] ? { optionName2: names[1] } : {}),
        ...(names[2] ? { optionName3: names[2] } : {}),
        ...(combination.supplierOptionReference
          ? { sellerManagerCode: combination.supplierOptionReference }
          : {}),
      },
    ];
  });
  return {
    optionCombinationSortType: "CREATE",
    optionCombinationGroupNames: {
      optionGroupName1: groups[0]?.name ?? "",
      ...(groups[1] ? { optionGroupName2: groups[1].name } : {}),
      ...(groups[2] ? { optionGroupName3: groups[2].name } : {}),
    },
    optionCombinations: combinations,
    useStockManagement: true,
  };
}

function validateOriginArea(
  originArea: NaverPublicationProfile["originAreaInfo"],
  issues: NaverProductPayloadIssue[],
) {
  if (!originArea) return;
  if (originArea.originAreaCode === "02" && !originArea.importer?.trim()) {
    issues.push({
      path: "originProduct.detailAttribute.originAreaInfo.importer",
      code: "required",
      message: "수입산은 수입사명이 필요합니다.",
    });
  }
  if (originArea.originAreaCode === "04" && !originArea.content?.trim()) {
    issues.push({
      path: "originProduct.detailAttribute.originAreaInfo.content",
      code: "required",
      message: "직접 입력 원산지의 표시 내용이 필요합니다.",
    });
  }
}

function validateDeliveryInfo(
  deliveryInfo: NaverPublicationProfile["deliveryInfo"],
  issues: NaverProductPayloadIssue[],
) {
  if (!deliveryInfo) return;
  if (!["DELIVERY", "DIRECT"].includes(String(deliveryInfo.deliveryType))) {
    issues.push({
      path: "originProduct.deliveryInfo.deliveryType",
      code: "invalid",
      message: "배송 방법 유형이 필요합니다.",
    });
  }
  if (
    ![
      "NORMAL",
      "TODAY",
      "OPTION_TODAY",
      "HOPE",
      "TODAY_ARRIVAL",
      "DAWN_ARRIVAL",
      "ARRIVAL_GUARANTEE",
      "SELLER_GUARANTEE",
      "HOPE_SELLER_GUARANTEE",
      "QUICK",
      "PICKUP",
      "QUICK_PICKUP",
    ].includes(String(deliveryInfo.deliveryAttributeType))
  ) {
    issues.push({
      path: "originProduct.deliveryInfo.deliveryAttributeType",
      code: "invalid",
      message: "배송 속성 유형이 필요합니다.",
    });
  }
}

function validateAfterServiceInfo(
  afterServiceInfo: NaverPublicationProfile["afterServiceInfo"],
  issues: NaverProductPayloadIssue[],
) {
  if (!afterServiceInfo) return;
  if (!afterServiceInfo.afterServiceTelephoneNumber.trim()) {
    issues.push({
      path: "originProduct.detailAttribute.afterServiceInfo.afterServiceTelephoneNumber",
      code: "required",
      message: "A/S 전화번호가 필요합니다.",
    });
  }
  if (!afterServiceInfo.afterServiceGuideContent.trim()) {
    issues.push({
      path: "originProduct.detailAttribute.afterServiceInfo.afterServiceGuideContent",
      code: "required",
      message: "A/S 안내가 필요합니다.",
    });
  }
}

function validateProvidedNotice(
  notice: NaverPublicationProfile["productInfoProvidedNotice"],
  issues: NaverProductPayloadIssue[],
) {
  if (!notice) return;
  const type = notice.productInfoProvidedNoticeType;
  if (!NOTICE_TYPES.has(type)) {
    issues.push({
      path: "originProduct.detailAttribute.productInfoProvidedNotice.productInfoProvidedNoticeType",
      code: "invalid",
      message: "지원하지 않는 상품정보제공고시 상품군입니다.",
    });
    return;
  }
  const bodyKey = type
    .toLowerCase()
    .replace(/_([a-z])/g, (_, character: string) => character.toUpperCase());
  if (
    !notice[bodyKey] ||
    typeof notice[bodyKey] !== "object" ||
    Array.isArray(notice[bodyKey])
  ) {
    issues.push({
      path: `originProduct.detailAttribute.productInfoProvidedNotice.${bodyKey}`,
      code: "required",
      message: `${type} 상품군의 고시 항목이 필요합니다.`,
    });
  }
}

function stableStringify(value: JsonValue | NaverProductPayload): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableStringify((value as Record<string, JsonValue>)[key]!)}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
