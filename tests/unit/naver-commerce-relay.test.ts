import { describe, expect, it, vi } from "vitest";
import {
  createNaverCommerceRelayHandler,
  NaverCommerceRelayClient,
} from "@/modules/channels/naver/naver-commerce-relay";
import {
  createNaverRelaySignature,
  NAVER_RELAY_HEADERS,
  verifyNaverRelaySignature,
} from "@/modules/channels/naver/naver-relay-auth";
import type { NaverProductPayload } from "@/modules/channels/naver/naver-product-payload";

const now = 1_752_700_000_000;
const sharedSecret = "test-shared-secret-that-is-at-least-32-characters";
const nonce = "fixed-nonce-123456";
const categories = [
  {
    id: "50000805",
    name: "원피스",
    wholeCategoryName: "패션의류>여성의류>원피스",
    last: true,
  },
];
const productModels = [
  {
    id: 123,
    name: "여성 여름 원피스",
    categoryId: "50000805",
    wholeCategoryName: "패션의류>여성의류>원피스",
  },
];
const productAttributes = [
  {
    attributeSeq: 10,
    attributeName: "색상",
    attributeClassificationType: "SINGLE_SELECT" as const,
    attributeType: "PRIMARY" as const,
  },
];
const standardOptions = {
  useStandardOption: true,
  standardOptionCategoryGroups: [
    {
      attributeName: "색상",
      imageRegistrationUsable: true,
      realValueUsable: false,
      optionSetRequired: true,
    },
  ],
};
const productPayload = {
  originProduct: {
    statusType: "SALE",
    saleType: "NEW",
    leafCategoryId: "50000805",
    name: "테스트 상품",
    detailContent: "<p>테스트 상품 상세</p>",
    images: {
      representativeImage: {
        url: "https://shop-phinf.pstatic.net/uploaded.jpg",
      },
      optionalImages: [],
    },
    salePrice: 10000,
    stockQuantity: 3,
    deliveryInfo: { deliveryType: "DELIVERY" },
    detailAttribute: {
      afterServiceInfo: {
        afterServiceTelephoneNumber: "02-0000-0000",
        afterServiceGuideContent: "판매자 문의",
      },
      originAreaInfo: { originAreaCode: "00", plural: false },
      sellerCodeInfo: { sellerManagementCode: "TEST-001" },
      productAttributes: [],
      productInfoProvidedNotice: { productInfoProvidedNoticeType: "ETC" },
      taxType: "TAX",
      minorPurchasable: true,
    },
  },
  smartstoreChannelProduct: {
    naverShoppingRegistration: true,
    channelProductDisplayStatusType: "ON",
  },
} as NaverProductPayload;

function metadataClientMocks() {
  return {
    fetchChannelProduct: vi.fn().mockResolvedValue({
      originProduct: {
        leafCategoryId: "50000805",
        name: "여성 여름 원피스",
        detailAttribute: { productAttributes: [], seoInfo: { sellerTags: [] } },
      },
    }),
    fetchProductAttributes: vi.fn().mockResolvedValue(productAttributes),
    fetchProductAttributeValues: vi.fn().mockResolvedValue([]),
    fetchProductAttributeUnits: vi.fn().mockResolvedValue([]),
    fetchStandardOptions: vi.fn().mockResolvedValue(standardOptions),
    fetchProvidedNotices: vi.fn().mockResolvedValue([]),
    fetchProvidedNotice: vi.fn().mockResolvedValue({
      productInfoProvidedNoticeType: "ETC",
      productInfoProvidedNoticeTypeName: "기타 재화",
      productInfoProvidedNoticeContents: [],
    }),
    uploadProductImages: vi.fn().mockResolvedValue([
      { url: "https://shop-phinf.pstatic.net/uploaded.jpg" },
    ]),
    createProduct: vi.fn().mockResolvedValue({
      originProductNo: "100000001",
      channelProductNo: "200000001",
    }),
  };
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json;charset=UTF-8" },
  });
}

async function signedRequest(path = "/v1/categories") {
  const signature = await createNaverRelaySignature(sharedSecret, {
    timestamp: now,
    nonce,
    method: "GET",
    pathAndQuery: path,
  });
  return new Request(`https://relay.example.test${path}`, {
    headers: {
      [NAVER_RELAY_HEADERS.timestamp]: String(now),
      [NAVER_RELAY_HEADERS.nonce]: nonce,
      [NAVER_RELAY_HEADERS.signature]: signature,
    },
  });
}

describe("네이버 커머스API 중계 인증", () => {
  it("상품정보제공고시 목록과 단건 경로만 제한적으로 전달한다", async () => {
    const client = {
      fetchCategories: vi.fn().mockResolvedValue(categories),
      fetchProductModels: vi.fn().mockResolvedValue(productModels),
      ...metadataClientMocks(),
    };
    const handler = createNaverCommerceRelayHandler({
      sharedSecret,
      client,
      now: () => now,
    });
    const listPath = "/v1/products-for-provided-notice?categoryId=50000000";
    const listResponse = await handler(await signedRequest(listPath));
    expect(listResponse.status).toBe(200);
    expect(client.fetchProvidedNotices).toHaveBeenCalledWith("50000000");

    const secondHandler = createNaverCommerceRelayHandler({
      sharedSecret,
      client,
      now: () => now,
    });
    const singleResponse = await secondHandler(
      await signedRequest("/v1/products-for-provided-notice/KITCHEN_UTENSILS"),
    );
    expect(singleResponse.status).toBe(200);
    expect(client.fetchProvidedNotice).toHaveBeenCalledWith("KITCHEN_UTENSILS");
  });

  it("요청 경로와 본문까지 포함한 HMAC 서명을 검증한다", async () => {
    const input = {
      timestamp: now,
      nonce,
      method: "GET",
      pathAndQuery: "/v1/categories?last=true",
    };
    const signature = await createNaverRelaySignature(sharedSecret, input);

    await expect(
      verifyNaverRelaySignature(sharedSecret, input, signature),
    ).resolves.toBe(true);
    await expect(
      verifyNaverRelaySignature(
        sharedSecret,
        { ...input, pathAndQuery: "/v1/categories?last=false" },
        signature,
      ),
    ).resolves.toBe(false);
  });

  it("유효한 요청만 허용하고 같은 nonce의 재전송을 거부한다", async () => {
    const client = {
      fetchCategories: vi.fn().mockResolvedValue(categories),
      fetchProductModels: vi.fn().mockResolvedValue(productModels),
      ...metadataClientMocks(),
    };
    const handler = createNaverCommerceRelayHandler({
      sharedSecret,
      client,
      now: () => now,
    });

    const response = await handler(
      await signedRequest("/v1/categories?last=true"),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(categories);
    expect(client.fetchCategories).toHaveBeenCalledWith({ last: true });

    const replay = await handler(
      await signedRequest("/v1/categories?last=true"),
    );
    expect(replay.status).toBe(401);
    expect(client.fetchCategories).toHaveBeenCalledTimes(1);
  });

  it("서명 시간이 허용 범위를 벗어나면 네이버를 호출하지 않는다", async () => {
    const client = {
      fetchCategories: vi.fn(),
      fetchProductModels: vi.fn(),
      ...metadataClientMocks(),
    };
    const handler = createNaverCommerceRelayHandler({
      sharedSecret,
      client,
      now: () => now + 5 * 60_000 + 1,
    });

    const response = await handler(await signedRequest());
    expect(response.status).toBe(401);
    expect(client.fetchCategories).not.toHaveBeenCalled();
  });

  it("상품명 카탈로그 검색 경로만 허용한다", async () => {
    const client = {
      fetchCategories: vi.fn(),
      fetchProductModels: vi.fn().mockResolvedValue(productModels),
      ...metadataClientMocks(),
    };
    const handler = createNaverCommerceRelayHandler({
      sharedSecret,
      client,
      now: () => now,
    });
    const path = "/v1/product-models?name=%EC%9B%90%ED%94%BC%EC%8A%A4&size=20";
    const response = await handler(await signedRequest(path));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(productModels);
    expect(client.fetchProductModels).toHaveBeenCalledWith("원피스", 20);
  });

  it("카테고리 속성과 표준 옵션 경로만 검증해 전달한다", async () => {
    const client = {
      fetchCategories: vi.fn(),
      fetchProductModels: vi.fn(),
      ...metadataClientMocks(),
    };
    const attributesHandler = createNaverCommerceRelayHandler({
      sharedSecret,
      client,
      now: () => now,
    });
    const attributesPath =
      "/v1/product-attributes/attributes?categoryId=50000805";
    const attributesResponse = await attributesHandler(
      await signedRequest(attributesPath),
    );
    expect(attributesResponse.status).toBe(200);
    expect(client.fetchProductAttributes).toHaveBeenCalledWith("50000805");

    const valuesHandler = createNaverCommerceRelayHandler({
      sharedSecret,
      client,
      now: () => now,
    });
    const valuesPath =
      "/v1/product-attributes/attribute-values?categoryId=50000805";
    const valuesResponse = await valuesHandler(await signedRequest(valuesPath));
    expect(valuesResponse.status).toBe(200);
    expect(client.fetchProductAttributeValues).toHaveBeenCalledWith("50000805");

    const unitsHandler = createNaverCommerceRelayHandler({
      sharedSecret,
      client,
      now: () => now,
    });
    const unitsPath = "/v1/product-attributes/attribute-value-units";
    const unitsResponse = await unitsHandler(await signedRequest(unitsPath));
    expect(unitsResponse.status).toBe(200);
    expect(client.fetchProductAttributeUnits).toHaveBeenCalledTimes(1);

    const optionsHandler = createNaverCommerceRelayHandler({
      sharedSecret,
      client,
      now: () => now,
    });
    const optionsPath = "/v1/options/standard-options?categoryId=50000805";
    const optionsResponse = await optionsHandler(
      await signedRequest(optionsPath),
    );
    expect(optionsResponse.status).toBe(200);
    expect(client.fetchStandardOptions).toHaveBeenCalledWith("50000805");
  });
});

describe("네이버 커머스API 중계 클라이언트", () => {
  it("검증된 상품 JSON만 HMAC 서명해 v2 등록 경로로 전달한다", async () => {
    const upstream = {
      fetchCategories: vi.fn(),
      fetchProductModels: vi.fn(),
      ...metadataClientMocks(),
    };
    const handler = createNaverCommerceRelayHandler({
      sharedSecret,
      client: upstream,
      now: () => now,
    });
    const fetcher = vi.fn<typeof fetch>(async (input, init) =>
      handler(new Request(input, init)),
    );
    const client = new NaverCommerceRelayClient(
      {
        relayUrl: "https://relay.example.test",
        sharedSecret,
        timeoutMs: 1000,
      },
      fetcher,
      () => now,
      () => nonce,
    );

    await expect(client.createProduct(productPayload)).resolves.toEqual({
      originProductNo: "100000001",
      channelProductNo: "200000001",
    });
    expect(upstream.createProduct).toHaveBeenCalledWith(productPayload);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      "https://relay.example.test/v2/products",
    );
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe("POST");
  });

  it("multipart 이미지 바이트를 HMAC 서명해 허용된 업로드 경로로 전달한다", async () => {
    const upstream = {
      fetchCategories: vi.fn(),
      fetchProductModels: vi.fn(),
      ...metadataClientMocks(),
    };
    const handler = createNaverCommerceRelayHandler({
      sharedSecret,
      client: upstream,
      now: () => now,
    });
    const fetcher = vi.fn<typeof fetch>(async (input, init) =>
      handler(new Request(input, init)),
    );
    const client = new NaverCommerceRelayClient(
      {
        relayUrl: "https://relay.example.test",
        sharedSecret,
        timeoutMs: 1000,
      },
      fetcher,
      () => now,
      () => nonce,
    );

    await expect(
      client.uploadProductImages([
        {
          name: "product.jpg",
          type: "image/jpeg",
          bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
        },
      ]),
    ).resolves.toEqual([
      { url: "https://shop-phinf.pstatic.net/uploaded.jpg" },
    ]);
    expect(upstream.uploadProductImages).toHaveBeenCalledWith([
      expect.objectContaining({ name: "image-1.jpg", type: "image/jpeg" }),
    ]);
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe("POST");
  });

  it("네이버 인증정보 없이 서명된 요청을 보내고 응답을 검증한다", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(categories));
    const client = new NaverCommerceRelayClient(
      {
        relayUrl: "https://relay.example.test",
        sharedSecret,
        timeoutMs: 1000,
      },
      fetcher,
      () => now,
      () => nonce,
    );

    await expect(client.fetchCategories({ last: true })).resolves.toEqual(
      categories,
    );
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe(
      "https://relay.example.test/v1/categories?last=true",
    );
    expect(init?.headers).toMatchObject({
      [NAVER_RELAY_HEADERS.timestamp]: String(now),
      [NAVER_RELAY_HEADERS.nonce]: nonce,
    });
    expect(JSON.stringify(init)).not.toContain("client_secret");
  });

  it("상품명을 서명된 카탈로그 검색 요청으로 전달한다", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json(productModels));
    const client = new NaverCommerceRelayClient(
      {
        relayUrl: "https://relay.example.test",
        sharedSecret,
        timeoutMs: 1000,
      },
      fetcher,
      () => now,
      () => nonce,
    );

    await expect(client.fetchProductModels("여름 원피스", 20)).resolves.toEqual(
      productModels,
    );
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      "/v1/product-models?name=%EC%97%AC%EB%A6%84+%EC%9B%90%ED%94%BC%EC%8A%A4&size=20",
    );
  });

  it("일시적인 503 응답은 새 서명으로 한 번 재시도한다", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ error: { code: "unavailable" } }, 503))
      .mockResolvedValueOnce(json(categories));
    const wait = vi.fn().mockResolvedValue(undefined);
    let nonceCounter = 0;
    const client = new NaverCommerceRelayClient(
      {
        relayUrl: "https://relay.example.test",
        sharedSecret,
        timeoutMs: 1000,
      },
      fetcher,
      () => now,
      () => `retry-nonce-${String(++nonceCounter).padStart(8, "0")}`,
      wait,
    );

    await expect(client.fetchCategories()).resolves.toEqual(categories);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(150);
    const firstHeaders = fetcher.mock.calls[0]?.[1]?.headers;
    const secondHeaders = fetcher.mock.calls[1]?.[1]?.headers;
    expect(firstHeaders).not.toEqual(secondHeaders);
  });

  it("숫자로 된 채널 상품 경로만 중계한다", async () => {
    const client = {
      fetchCategories: vi.fn().mockResolvedValue(categories),
      fetchProductModels: vi.fn().mockResolvedValue(productModels),
      ...metadataClientMocks(),
    };
    const handler = createNaverCommerceRelayHandler({
      sharedSecret,
      client,
      now: () => now,
    });
    const response = await handler(
      await signedRequest("/v2/products/channel-products/200000001"),
    );

    expect(response.status).toBe(200);
    expect(client.fetchChannelProduct).toHaveBeenCalledWith("200000001");

    const invalidHandler = createNaverCommerceRelayHandler({
      sharedSecret,
      client,
      now: () => now,
    });
    const invalid = await invalidHandler(
      await signedRequest("/v2/products/channel-products/not-a-number"),
    );
    expect(invalid.status).toBe(404);
  });
});
