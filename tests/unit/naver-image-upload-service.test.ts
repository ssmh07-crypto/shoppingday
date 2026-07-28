import { describe, expect, it, vi } from "vitest";
import {
  downloadNaverImage,
  NaverImageUploadService,
} from "@/modules/channels/naver/naver-image-upload-service";
import type { SelectedImage } from "@/lib/db/schema";
import type { ProductEditRepository } from "@/modules/products/product-edit-repository";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

describe("네이버 상품 이미지 업로드", () => {
  it("공급처 이미지를 검증하고 네이버 URL을 상품 이미지에 대응시킨다", async () => {
    const selectedImages: SelectedImage[] = [
      {
        id: "image-1",
        source: "supplier" as const,
        sourceUrl: "https://supplier.example/product.jpg",
        storedUrl: null,
        altText: "",
        sortOrder: 0,
        isPrimary: true,
        enabled: true,
      },
      {
        id: "image-2",
        source: "supplier" as const,
        sourceUrl: "https://supplier.example/product-2.jpg",
        storedUrl: null,
        altText: "",
        sortOrder: 1,
        isPrimary: false,
        enabled: true,
      },
    ];
    const product = { draftVersion: 2, selectedImages };
    let savedImages = selectedImages;
    const saveNaverImageUrls = vi.fn(
      async (
        _productId: string,
        _ownerId: string,
        version: number,
        uploads: Array<{
          imageId: string;
          sourceUrl: string;
          storedUrl: string;
        }>,
      ) => {
        savedImages = savedImages.map((image) => {
          const upload = uploads.find((item) => item.imageId === image.id);
          return upload ? { ...image, storedUrl: upload.storedUrl } : image;
        });
        return {
          kind: "ok" as const,
          product: {
            draftVersion: version + 1,
            selectedImages: savedImages,
          },
        };
      },
    );
    const repo = {
      find: vi.fn().mockResolvedValue({ product }),
      saveNaverImageUrls,
    } as unknown as ProductEditRepository;
    const client = {
      uploadProductImages: vi
        .fn()
        .mockResolvedValueOnce([
          { url: "https://shop-phinf.pstatic.net/image-1.jpg" },
        ])
        .mockResolvedValueOnce([
          { url: "https://shop-phinf.pstatic.net/image-2.jpg" },
        ]),
    };
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
      new Response(jpeg, {
        headers: { "content-type": "image/jpeg", "content-length": "4" },
      }),
    );

    const result = await new NaverImageUploadService(
      repo,
      client,
      fetcher,
    ).upload("product-id", "owner-id", 2);

    expect(result.uploadedCount).toBe(2);
    expect(client.uploadProductImages).toHaveBeenNthCalledWith(1, [
      expect.objectContaining({ type: "image/jpeg", bytes: jpeg }),
    ]);
    expect(client.uploadProductImages).toHaveBeenNthCalledWith(2, [
      expect.objectContaining({ type: "image/jpeg", bytes: jpeg }),
    ]);
    expect(saveNaverImageUrls).toHaveBeenNthCalledWith(
      1,
      "product-id",
      "owner-id",
      2,
      [
        {
          imageId: "image-1",
          sourceUrl: "https://supplier.example/product.jpg",
          storedUrl: "https://shop-phinf.pstatic.net/image-1.jpg",
        },
      ],
    );
    expect(saveNaverImageUrls).toHaveBeenNthCalledWith(
      2,
      "product-id",
      "owner-id",
      3,
      [
        {
          imageId: "image-2",
          sourceUrl: "https://supplier.example/product-2.jpg",
          storedUrl: "https://shop-phinf.pstatic.net/image-2.jpg",
        },
      ],
    );
    expect(result.product.draftVersion).toBe(4);
  });

  it("여러 이미지 중 다음 업로드가 실패해도 먼저 성공한 URL은 즉시 저장한다", async () => {
    const selectedImages: SelectedImage[] = [
      {
        id: "image-1",
        source: "supplier" as const,
        sourceUrl: "https://supplier.example/1.jpg",
        storedUrl: null,
        altText: "",
        sortOrder: 0,
        isPrimary: true,
        enabled: true,
      },
      {
        id: "image-2",
        source: "supplier" as const,
        sourceUrl: "https://supplier.example/2.jpg",
        storedUrl: null,
        altText: "",
        sortOrder: 1,
        isPrimary: false,
        enabled: true,
      },
    ];
    const saveNaverImageUrls = vi.fn().mockResolvedValue({
      kind: "ok",
      product: {
        draftVersion: 3,
        selectedImages: [
          {
            ...selectedImages[0]!,
            storedUrl: "https://shop-phinf.pstatic.net/image-1.jpg",
          },
          selectedImages[1]!,
        ],
      },
    });
    const repo = {
      find: vi.fn().mockResolvedValue({
        product: { draftVersion: 2, selectedImages },
      }),
      saveNaverImageUrls,
    } as unknown as ProductEditRepository;
    const client = {
      uploadProductImages: vi
        .fn()
        .mockResolvedValueOnce([
          { url: "https://shop-phinf.pstatic.net/image-1.jpg" },
        ])
        .mockRejectedValueOnce(new Error("second_upload_failed")),
    };
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
      new Response(jpeg, {
        headers: { "content-type": "image/jpeg", "content-length": "4" },
      }),
    );

    await expect(
      new NaverImageUploadService(repo, client, fetcher).upload(
        "product-id",
        "owner-id",
        2,
      ),
    ).rejects.toThrow("second_upload_failed");

    expect(saveNaverImageUrls).toHaveBeenCalledTimes(1);
    expect(saveNaverImageUrls).toHaveBeenCalledWith(
      "product-id",
      "owner-id",
      2,
      [
        {
          imageId: "image-1",
          sourceUrl: "https://supplier.example/1.jpg",
          storedUrl: "https://shop-phinf.pstatic.net/image-1.jpg",
        },
      ],
    );
  });

  it("내부 네트워크 URL과 MIME 위장 이미지를 거부한다", async () => {
    await expect(
      downloadNaverImage("http://127.0.0.1/private.jpg", 0, vi.fn()),
    ).rejects.toMatchObject({
      errors: { selectedImages: "허용되지 않은 이미지 URL입니다." },
    });
    await expect(
      downloadNaverImage(
        "https://supplier.example/fake.jpg",
        0,
        vi.fn<typeof fetch>().mockResolvedValue(
          new Response(new Uint8Array([1, 2, 3]), {
            headers: { "content-type": "image/jpeg" },
          }),
        ),
      ),
    ).rejects.toMatchObject({
      errors: { selectedImages: "이미지 파일 형식이나 크기를 확인해 주세요." },
    });
  });
});
