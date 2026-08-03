import { z } from "zod";
import type { Database } from "@/lib/db";
import { suppliers } from "@/lib/db/schema";
import {
  DrizzleProductRepository,
} from "@/modules/products/product-repository";
import { supplierProductChanged } from "@/modules/products/product-domain";
import type { SupplierProduct } from "@/modules/suppliers/core/types";

const httpUrl = z
  .url()
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol));

const capturedOptionSchema = z.object({
  name: z.string().trim().min(1).max(100),
  price: z.number().int().min(-100_000_000).max(100_000_000).nullable(),
});

export const zicgamCapturedProductSchema = z.object({
  externalProductId: z.string().regex(/^\d+$/).max(30),
  url: httpUrl.refine((value) => new URL(value).hostname === "zicgam.com"),
  originalName: z.string().trim().min(1).max(200),
  supplierPrice: z.number().int().min(0).max(1_000_000_000).nullable(),
  availability: z.enum(["active", "sold_out", "unknown"]),
  images: z.array(httpUrl).max(100),
  options: z.array(capturedOptionSchema).max(500),
  rawDescription: z.string().max(200_000).nullable(),
  capturedAt: z.iso.datetime(),
  evidence: z.array(z.string().max(500)).max(20).default([]),
});

export type ZicgamCapturedProduct = z.infer<
  typeof zicgamCapturedProductSchema
>;

export class ZicgamImportService {
  private readonly products: DrizzleProductRepository;

  constructor(private readonly database: Database) {
    this.products = new DrizzleProductRepository(database);
  }

  async importCaptured(input: ZicgamCapturedProduct, ownerId: string) {
    await this.database
      .insert(suppliers)
      .values({ code: "zicgam", name: "직감", status: "active" })
      .onConflictDoNothing({ target: suppliers.code });

    const product = toSupplierProduct(input);
    const existing = await this.products.findImported(
      product.supplierCode,
      product.externalProductId,
    );
    if (!existing) {
      const imported = await this.products.importSupplierProduct(product, ownerId);
      return {
        success: true as const,
        action: "created" as const,
        productId: imported.productId,
        externalProductId: product.externalProductId,
      };
    }
    if (!supplierProductChanged(existing.supplierProduct, product)) {
      return {
        success: true as const,
        action: "unchanged" as const,
        productId: existing.productId,
        externalProductId: product.externalProductId,
      };
    }
    await this.products.updateSupplierProduct(
      existing.supplierProductId,
      product,
      existing,
    );
    return {
      success: true as const,
      action: "updated" as const,
      productId: existing.productId,
      externalProductId: product.externalProductId,
    };
  }
}

function toSupplierProduct(input: ZicgamCapturedProduct): SupplierProduct {
  return {
    supplierCode: "zicgam",
    externalProductId: input.externalProductId,
    originalName: input.originalName,
    supplierPrice: input.supplierPrice,
    currency: "KRW",
    availability: input.availability,
    images: [...new Set(input.images)],
    options: input.options,
    rawDescription: input.rawDescription,
    supplierCreatedAt: null,
    supplierUpdatedAt: null,
    rawPayload: {
      provider: "zicgam",
      url: input.url,
      capturedAt: input.capturedAt,
      evidence: input.evidence,
    },
  };
}
