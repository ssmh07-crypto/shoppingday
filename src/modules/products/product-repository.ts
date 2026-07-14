import 'server-only'
import { and, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import {
  products,
  productSupplierLinks,
  supplierProducts,
  suppliers,
  type SupplierProductRow,
} from '@/lib/db/schema'
import type { SupplierProduct } from '@/modules/suppliers/core/types'
import { imagesFromSupplier, optionsFromSupplier, sanitizeDescription } from './product-domain'

export interface ImportedProductRecord {
  productId: string
  supplierProductId: string
  supplierProduct: SupplierProductRow
}

export interface ProductRepository {
  findImported(supplierCode: string, externalProductId: string): Promise<ImportedProductRecord | null>
  importSupplierProduct(product: SupplierProduct, ownerId: string): Promise<ImportedProductRecord>
  updateSupplierProduct(supplierProductId: string, product: SupplierProduct): Promise<ImportedProductRecord>
  findDetail(productId: string): Promise<ProductDetail | null>
}

export interface ProductDetail {
  productId: string
  productStatus: string
  supplierCode: string
  supplierName: string
  supplierProduct: SupplierProductRow
}

export class DrizzleProductRepository implements ProductRepository {
  async updateSupplierProduct(supplierProductId: string, product: SupplierProduct) {
    const [supplierProduct] = await getDb()
      .update(supplierProducts)
      .set({
        originalName: product.originalName,
        supplierPrice: product.supplierPrice === null ? null : String(product.supplierPrice),
        currency: product.currency,
        availability: product.availability,
        originalImages: product.images,
        originalOptions: product.options,
        rawDescription: product.rawDescription,
        rawPayload: product.rawPayload,
        supplierCreatedAt: product.supplierCreatedAt,
        supplierUpdatedAt: product.supplierUpdatedAt,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(supplierProducts.id, supplierProductId))
      .returning()
    if (!supplierProduct) throw new Error('supplier_product_not_found')
    const existing = await this.findImported(product.supplierCode, product.externalProductId)
    if (!existing) throw new Error('product_link_not_found')
    return { ...existing, supplierProduct }
  }

  async findImported(supplierCode: string, externalProductId: string) {
    const [row] = await getDb()
      .select({
        productId: productSupplierLinks.productId,
        supplierProductId: supplierProducts.id,
        supplierProduct: supplierProducts,
      })
      .from(supplierProducts)
      .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
      .innerJoin(
        productSupplierLinks,
        eq(productSupplierLinks.supplierProductId, supplierProducts.id),
      )
      .where(
        and(
          eq(suppliers.code, supplierCode),
          eq(supplierProducts.externalProductId, externalProductId),
        ),
      )
      .limit(1)
    return row ?? null
  }

  async importSupplierProduct(product: SupplierProduct, ownerId: string) {
    try {
      return await getDb().transaction(async (tx) => {
      const [supplier] = await tx
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(eq(suppliers.code, product.supplierCode))
        .limit(1)
      if (!supplier) throw new Error('supplier_not_configured')

      const [supplierProduct] = await tx
        .insert(supplierProducts)
        .values({
          supplierId: supplier.id,
          externalProductId: product.externalProductId,
          originalName: product.originalName,
          supplierPrice: product.supplierPrice === null ? null : String(product.supplierPrice),
          currency: product.currency,
          availability: product.availability,
          originalImages: product.images,
          originalOptions: product.options,
          rawDescription: product.rawDescription,
          rawPayload: product.rawPayload,
          supplierCreatedAt: product.supplierCreatedAt,
          supplierUpdatedAt: product.supplierUpdatedAt,
        })
        .returning()

      const [draft] = await tx.insert(products).values({
        ownerId, status: 'draft', title: product.originalName ?? '', description: sanitizeDescription(product.rawDescription ?? ''),
        selectedImages: imagesFromSupplier(product.images), editedOptions: optionsFromSupplier(product.options),
      }).returning({ id: products.id })
      await tx.insert(productSupplierLinks).values({
        productId: draft.id,
        supplierProductId: supplierProduct.id,
        isPrimary: true,
      })

        return { productId: draft.id, supplierProductId: supplierProduct.id, supplierProduct }
      })
    } catch (error) {
      // Concurrent requests can both pass the initial read. Resolve the unique
      // constraint race to the record committed by the winning transaction.
      if (isUniqueViolation(error)) {
        const existing = await this.findImported(product.supplierCode, product.externalProductId)
        if (existing) return existing
      }
      throw error
    }
  }

  async findDetail(productId: string): Promise<ProductDetail | null> {
    const [row] = await getDb()
      .select({
        productId: products.id,
        productStatus: products.status,
        supplierCode: suppliers.code,
        supplierName: suppliers.name,
        supplierProduct: supplierProducts,
      })
      .from(products)
      .innerJoin(productSupplierLinks, eq(productSupplierLinks.productId, products.id))
      .innerJoin(supplierProducts, eq(supplierProducts.id, productSupplierLinks.supplierProductId))
      .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplierId))
      .where(eq(products.id, productId))
      .limit(1)
    return row ?? null
  }
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505')
}
