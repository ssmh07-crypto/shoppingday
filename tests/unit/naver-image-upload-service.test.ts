import { describe, expect, it, vi } from "vitest";
import {
  downloadNaverImage,
  NaverImageUploadService,
} from "@/modules/channels/naver/naver-image-upload-service";
import type { ProductEditRepository } from "@/modules/products/product-edit-repository";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

describe("네이버 상품 이미지 업로드", () => {
  it("공급처 이미지를 검증하고 네이버 URL을 상품 이미지에 대응시킨다", async () => {
    const selectedImages = [
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
    ];
    const product = { draftVersion: 2, selectedImages };
    const repo = {
      find: vi.fn().mockResolvedValue({ product }),
      saveNaverImageUrls: vi.fn().mockResolvedValue({
        kind: "ok",
        product: {
          ...product,
          draftVersion: 3,
          selectedImages: selectedImages.map((image) => ({
            ...image,
            storedUrl: "https://shop-phinf.pstatic.net/uploaded.jpg",
          })),
        },
      }),
    } as unknown as ProductEditRepository;
    const client = {
      uploadProductImages: vi
        .fn()
        .mockResolvedValue([
          { url: "https://shop-phinf.pstatic.net/uploaded.jpg" },
        ]),
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(jpeg, {
        headers: { "content-type": "image/jpeg", "content-length": "4" },
      }),
    );

    const result = await new NaverImageUploadService(
      repo,
      client,
      fetcher,
    ).upload("product-id", "owner-id", 2);

    expect(result.uploadedCount).toBe(1);
    expect(client.uploadProductImages).toHaveBeenCalledWith([
      expect.objectContaining({ type: "image/jpeg", bytes: jpeg }),
    ]);
    expect(repo.saveNaverImageUrls).toHaveBeenCalledWith(
      "product-id",
      "owner-id",
      2,
      [
        {
          imageId: "image-1",
          sourceUrl: "https://supplier.example/product.jpg",
          storedUrl: "https://shop-phinf.pstatic.net/uploaded.jpg",
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
