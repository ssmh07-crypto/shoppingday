import { describe, expect, it } from "vitest";
import {
  buildNaverProductPayload,
  type NaverProductPayloadSource,
  type NaverPublicationProfile,
} from "@/modules/channels/naver/naver-product-payload";

const source: NaverProductPayloadSource = {
  sellerManagementCode: "DOME-1234",
  title: "레트로 메모 포스트잇",
  sellingPrice: 12_000,
  description: "<p>상세 설명</p>",
  naverCategoryId: "50003558",
  searchTags: ["포스트잇", "메모지"],
  selectedImages: [
    {
      id: "primary",
      source: "supplier",
      sourceUrl: "https://supplier.example/primary.jpg",
      storedUrl: "https://shop-phinf.pstatic.net/primary.jpg",
      altText: "",
      sortOrder: 0,
      isPrimary: true,
      enabled: true,
    },
    {
      id: "optional",
      source: "supplier",
      sourceUrl: "https://supplier.example/optional.jpg",
      storedUrl: "https://shop-phinf.pstatic.net/optional.jpg",
      altText: "",
      sortOrder: 1,
      isPrimary: false,
      enabled: true,
    },
  ],
  editedOptions: {
    groups: [
      {
        id: "color",
        name: "색상",
        values: [
          { id: "red", name: "빨강", enabled: true },
          { id: "blue", name: "파랑", enabled: true },
        ],
      },
      {
        id: "size",
        name: "크기",
        values: [{ id: "large", name: "대", enabled: true }],
      },
    ],
    combinations: [
      {
        id: "red-large",
        valueIds: ["red", "large"],
        additionalPrice: 500,
        stock: 3,
        enabled: true,
        supplierOptionReference: "SUP-RED-L",
      },
      {
        id: "blue-large",
        valueIds: ["blue", "large"],
        additionalPrice: 0,
        stock: 2,
        enabled: true,
        supplierOptionReference: null,
      },
    ],
  },
  naverAttributes: [
    {
      attributeSeq: 10018883,
      attributeValueSeq: 10809926,
      minValue: "",
      maxValue: "50",
      unitCode: "A02109",
    },
  ],
};

const profile: NaverPublicationProfile = {
  deliveryInfo: {
    deliveryType: "DELIVERY",
    deliveryAttributeType: "NORMAL",
    deliveryFee: { deliveryFeeType: "FREE" },
  },
  afterServiceInfo: {
    afterServiceTelephoneNumber: "02-1234-5678",
    afterServiceGuideContent: "판매자에게 문의해 주세요.",
  },
  originAreaInfo: { originAreaCode: "00", plural: false },
  productInfoProvidedNotice: {
    productInfoProvidedNoticeType: "ETC",
    etc: {
      itemName: "상품 상세 참조",
      modelName: "상품 상세 참조",
    },
  },
  taxType: "TAX",
  minorPurchasable: true,
  naverShoppingRegistration: true,
  channelProductDisplayStatusType: "ON",
};

describe("네이버 v2 상품 payload 변환", () => {
  it("카테고리, 속성, 이미지, 태그와 조합 옵션을 공식 구조로 변환한다", () => {
    const result = buildNaverProductPayload(source, profile);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.originProduct).toMatchObject({
      statusType: "SALE",
      saleType: "NEW",
      leafCategoryId: "50003558",
      name: "레트로 메모 포스트잇",
      salePrice: 12_000,
      stockQuantity: 5,
      images: {
        representativeImage: {
          url: "https://shop-phinf.pstatic.net/primary.jpg",
        },
        optionalImages: [
          { url: "https://shop-phinf.pstatic.net/optional.jpg" },
        ],
      },
      detailAttribute: {
        sellerCodeInfo: { sellerManagementCode: "DOME-1234" },
        productAttributes: [
          { attributeSeq: 10018883, attributeValueSeq: 10809926 },
        ],
        seoInfo: {
          sellerTags: [{ text: "포스트잇" }, { text: "메모지" }],
        },
        optionInfo: {
          optionCombinationGroupNames: {
            optionGroupName1: "색상",
            optionGroupName2: "크기",
          },
          optionCombinations: [
            {
              stockQuantity: 3,
              price: 500,
              usable: true,
              optionName1: "빨강",
              optionName2: "대",
              sellerManagerCode: "SUP-RED-L",
            },
            {
              stockQuantity: 2,
              price: 0,
              usable: true,
              optionName1: "파랑",
              optionName2: "대",
            },
          ],
          useStockManagement: true,
        },
      },
    });
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("객체 키 입력 순서와 무관하게 동일한 payload 해시를 만든다", () => {
    const first = buildNaverProductPayload(source, profile);
    const second = buildNaverProductPayload(source, {
      ...profile,
      deliveryInfo: {
        deliveryFee: { deliveryFeeType: "FREE" },
        deliveryAttributeType: "NORMAL",
        deliveryType: "DELIVERY",
      },
    });

    expect(first.ok && second.ok && first.hash).toBe(
      second.ok ? second.hash : "",
    );
  });

  it("옵션 없는 상품은 단일 재고를 사용한다", () => {
    const result = buildNaverProductPayload(
      { ...source, editedOptions: { groups: [], combinations: [] } },
      { ...profile, singleStockQuantity: 27 },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.originProduct.stockQuantity).toBe(27);
    expect(result.payload.originProduct.detailAttribute.optionInfo).toBe(
      undefined,
    );
  });

  it("네이버 업로드 이미지와 발행 정책 누락을 경로별로 반환한다", () => {
    const result = buildNaverProductPayload(
      {
        ...source,
        sellerManagementCode: "",
        selectedImages: source.selectedImages.map((image) => ({
          ...image,
          storedUrl: null,
        })),
        editedOptions: { groups: [], combinations: [] },
      },
      {},
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        "originProduct.images.representativeImage.url",
        "originProduct.stockQuantity",
        "originProduct.deliveryInfo",
        "originProduct.detailAttribute.afterServiceInfo",
        "originProduct.detailAttribute.originAreaInfo",
        "originProduct.detailAttribute.productInfoProvidedNotice",
        "originProduct.detailAttribute.taxType",
        "originProduct.detailAttribute.minorPurchasable",
        "smartstoreChannelProduct.naverShoppingRegistration",
        "smartstoreChannelProduct.channelProductDisplayStatusType",
      ]),
    );
  });

  it("속성값 ID 없는 속성과 불완전한 옵션 조합을 발행하지 않는다", () => {
    const result = buildNaverProductPayload(
      {
        ...source,
        naverAttributes: [
          {
            attributeSeq: 100,
            attributeValueSeq: null,
            minValue: "10",
            maxValue: "20",
            unitCode: "A02001",
          },
        ],
        editedOptions: {
          ...source.editedOptions,
          combinations: [
            {
              ...source.editedOptions.combinations[0]!,
              valueIds: ["red", "blue"],
            },
          ],
        },
      },
      profile,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unsupported",
          path: expect.stringContaining("attributeValueSeq"),
        }),
        expect.objectContaining({
          code: "invalid",
          path: expect.stringContaining("optionCombinations.0"),
        }),
      ]),
    );
  });

  it("상품정보제공고시 유형에 대응하는 본문을 요구한다", () => {
    const result = buildNaverProductPayload(source, {
      ...profile,
      productInfoProvidedNotice: {
        productInfoProvidedNoticeType: "KITCHEN_UTENSILS",
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        path: expect.stringContaining("kitchenUtensils"),
      }),
    );
  });
});
