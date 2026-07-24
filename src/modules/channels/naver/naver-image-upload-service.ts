import type { NaverImageUploadFile } from "./naver-commerce-client";
import type { NaverCategoriesClient } from "./naver-commerce-relay";
import type { ProductEditRepository } from "@/modules/products/product-edit-repository";
import {
  ProductConflictError,
  ProductNotFoundError,
  ProductValidationError,
} from "@/modules/products/product-errors";

const MAX_IMAGE_COUNT = 10;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

export class NaverImageUploadService {
  constructor(
    private readonly repo: ProductEditRepository,
    private readonly client: Pick<NaverCategoriesClient, "uploadProductImages">,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async upload(productId: string, ownerId: string, draftVersion: number) {
    const current = await this.repo.find(productId, ownerId);
    if (!current) throw new ProductNotFoundError();
    if (current.product.draftVersion !== draftVersion) {
      throw new ProductConflictError();
    }
    const enabled = current.product.selectedImages
      .filter((image) => image.enabled)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    if (!enabled.length || enabled.length > MAX_IMAGE_COUNT) {
      throw new ProductValidationError({
        selectedImages: "사용할 이미지는 1개 이상 10개 이하로 선택해 주세요.",
      });
    }
    const pending = enabled.filter((image) => !image.storedUrl);
    if (!pending.length) {
      return { kind: "ok" as const, product: current.product, uploadedCount: 0 };
    }

    const downloaded: Array<{
      imageId: string;
      sourceUrl: string;
      file: NaverImageUploadFile;
    }> = [];
    let totalBytes = 0;
    for (const [index, image] of pending.entries()) {
      const file = await downloadNaverImage(image.sourceUrl, index, this.fetcher);
      totalBytes += file.bytes.byteLength;
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new ProductValidationError({
          selectedImages: "업로드할 이미지의 전체 크기는 50 MiB 이하여야 합니다.",
        });
      }
      downloaded.push({ imageId: image.id, sourceUrl: image.sourceUrl, file });
    }

    const uploaded = await this.client.uploadProductImages(
      downloaded.map((item) => item.file),
    );
    if (uploaded.length !== downloaded.length) {
      throw new Error("naver_image_upload_count_mismatch");
    }
    const result = await this.repo.saveNaverImageUrls(
      productId,
      ownerId,
      draftVersion,
      downloaded.map((item, index) => ({
        imageId: item.imageId,
        sourceUrl: item.sourceUrl,
        storedUrl: uploaded[index]!.url,
      })),
    );
    if (result.kind === "not_found") throw new ProductNotFoundError();
    if (result.kind === "conflict") throw new ProductConflictError();
    return { ...result, uploadedCount: uploaded.length };
  }
}

export async function downloadNaverImage(
  sourceUrl: string,
  index: number,
  fetcher: typeof fetch = fetch,
): Promise<NaverImageUploadFile> {
  let url = validateExternalImageUrl(sourceUrl);
  let response: Response | undefined;
  for (let redirect = 0; redirect < 4; redirect += 1) {
    response = await fetcher(url, {
      method: "GET",
      redirect: "manual",
      headers: { accept: "image/jpeg,image/png" },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) break;
      url = validateExternalImageUrl(new URL(location, url).toString());
      continue;
    }
    break;
  }
  if (!response?.ok) {
    throw new ProductValidationError({
      selectedImages: "공급처 이미지를 내려받지 못했습니다.",
    });
  }
  const declaredSize = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_IMAGE_BYTES) {
    throw new ProductValidationError({
      selectedImages: "이미지는 파일당 10 MiB 이하여야 합니다.",
    });
  }
  const type = (response.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (type !== "image/jpeg" && type !== "image/png") {
    throw new ProductValidationError({
      selectedImages: "JPG 또는 PNG 이미지만 업로드할 수 있습니다.",
    });
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_IMAGE_BYTES || !hasImageSignature(bytes, type)) {
    throw new ProductValidationError({
      selectedImages: "이미지 파일 형식이나 크기를 확인해 주세요.",
    });
  }
  return {
    name: `product-image-${index + 1}.${type === "image/png" ? "png" : "jpg"}`,
    type,
    bytes,
  };
}

function validateExternalImageUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProductValidationError({ selectedImages: "이미지 URL이 올바르지 않습니다." });
  }
  const hostname = url.hostname.toLowerCase();
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "::1" ||
    /^(127\.|10\.|192\.168\.|169\.254\.)/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  ) {
    throw new ProductValidationError({ selectedImages: "허용되지 않은 이미지 URL입니다." });
  }
  return url;
}

function hasImageSignature(bytes: Uint8Array, type: string) {
  return type === "image/png"
    ? bytes.length >= 8 &&
        [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
    : bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}
