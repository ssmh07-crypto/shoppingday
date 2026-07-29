import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CommerceApiManagedProductImporter,
  CommerceApiManagedProductSalesReader,
  CommerceApiManagedProductUpdater,
} from "@/modules/keywords/naver-product-importer";

describe("네이버 관리 상품 정보 가져오기", () => {
  it("등록 카테고리·속성·판매자 태그를 사람이 확인할 수 있는 값으로 변환한다", async () => {
    const client = {
      fetchChannelProduct: vi.fn().mockResolvedValue({
        originProduct: {
          leafCategoryId: "50000805",
          name: "린넨 여름 원피스",
          detailAttribute: {
            productAttributes: [
              { attributeSeq: 10, attributeValueSeq: 100 },
              { attributeSeq: 20, attributeRealValue: "95", attributeRealValueUnitCode: "cm" },
            ],
            seoInfo: {
              sellerTags: [
                { code: 1, text: "여름원피스" },
                { code: 2, text: "여름원피스" },
              ],
            },
          },
        },
      }),
      fetchProductAttributes: vi.fn().mockResolvedValue([
        { attributeSeq: 10, attributeName: "소재" },
        { attributeSeq: 20, attributeName: "사이즈" },
      ]),
      fetchProductAttributeValues: vi.fn().mockResolvedValue([
        { attributeSeq: 10, attributeValueSeq: 100, minAttributeValue: "린넨" },
      ]),
    };
    const categories = {
      findLeafByIds: vi.fn().mockResolvedValue([
        {
          id: "50000805",
          name: "원피스",
          wholeCategoryName: "패션의류>여성의류>원피스",
          last: true,
        },
      ]),
    };
    const importer = new CommerceApiManagedProductImporter(
      client as never,
      categories as never,
    );

    await expect(importer.import("1234567890")).resolves.toMatchObject({
      currentTitle: "린넨 여름 원피스",
      categoryId: "50000805",
      category: "패션의류>여성의류>원피스",
      materials: ["린넨"],
      sizes: ["95cm"],
      searchTags: ["여름원피스"],
      attributes: [
        expect.objectContaining({ attributeName: "소재", value: "린넨" }),
        expect.objectContaining({ attributeName: "사이즈", value: "95cm" }),
      ],
    });
  });

  it("현재 전체 상품정보를 유지하면서 성장 관리 편집값을 교체한다", async () => {
    const client = {
      fetchChannelProduct: vi.fn().mockResolvedValue({
        originProduct: {
          statusType: "SALE",
          saleType: "NEW",
          leafCategoryId: "50000805",
          name: "기존 상품명",
          salePrice: 12000,
          detailAttribute: {
            productAttributes: [],
            seoInfo: { sellerTags: [{ text: "기존태그" }] },
          },
        },
        smartstoreChannelProduct: {
          naverShoppingRegistration: true,
          channelProductDisplayStatusType: "ON",
        },
      }),
      updateProduct: vi.fn().mockResolvedValue({
        originProductNo: "100000001",
        channelProductNo: "200000001",
      }),
    };
    const updater = new CommerceApiManagedProductUpdater(client as never);

    await updater.apply("200000001", {
      title: "변경 상품명",
      searchTags: ["새태그", "성장키워드"],
      salePrice: 15000,
      stockQuantity: 25,
      statusType: "SALE",
      naverAttributes: [],
      originProductNo: "100000001",
    });

    expect(client.updateProduct).toHaveBeenCalledWith(
      "100000001",
      expect.objectContaining({
        originProduct: expect.objectContaining({
          name: "변경 상품명",
          salePrice: 15000,
          stockQuantity: 25,
          statusType: "SALE",
          detailAttribute: expect.objectContaining({
            seoInfo: { sellerTags: [{ text: "새태그" }, { text: "성장키워드" }] },
          }),
        }),
        smartstoreChannelProduct: expect.objectContaining({
          channelProductDisplayStatusType: "ON",
        }),
      }),
    );
  });

  it("네이버 주문의 결제일과 잔여수량으로 7일·30일 판매량을 계산한다", async () => {
    const client = {
      fetchLastChangedProductOrders: vi.fn().mockResolvedValue({
        productOrderIds: ["order-1", "order-2", "order-3", "order-4"],
      }),
      fetchProductOrders: vi.fn().mockResolvedValue([
        {
          order: { paymentDate: "2026-07-27T12:00:00+09:00" },
          productOrder: {
            productId: "200000001",
            productOrderStatus: "DELIVERED",
            quantity: 2,
            remainQuantity: 2,
          },
        },
        {
          order: { paymentDate: "2026-07-10T12:00:00+09:00" },
          productOrder: {
            productId: "200000001",
            productOrderStatus: "PURCHASE_DECIDED",
            quantity: 3,
            remainQuantity: 3,
          },
        },
        {
          order: { paymentDate: "2026-07-26T12:00:00+09:00" },
          productOrder: {
            productId: "200000001",
            productOrderStatus: "CANCELED",
            quantity: 4,
            remainQuantity: 0,
          },
        },
        {
          order: { paymentDate: "2026-07-26T12:00:00+09:00" },
          productOrder: {
            productId: "999999999",
            productOrderStatus: "DELIVERED",
            quantity: 9,
            remainQuantity: 9,
          },
        },
      ]),
    };
    const reader = new CommerceApiManagedProductSalesReader(
      client as never,
      () => new Date("2026-07-29T00:00:00.000Z"),
    );

    await expect(reader.summarize("200000001")).resolves.toEqual({
      sevenDays: 2,
      thirtyDays: 5,
      fetchedAt: "2026-07-29T00:00:00.000Z",
      source: "naver_orders",
    });
    expect(client.fetchLastChangedProductOrders).toHaveBeenCalledTimes(30);
    expect(client.fetchProductOrders).toHaveBeenCalledTimes(1);
  });
});
