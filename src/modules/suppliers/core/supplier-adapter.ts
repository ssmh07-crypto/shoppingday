import type { SupplierFetchResult, SupplierProductsQuery } from "./types";

export interface SupplierAdapter {
  readonly code: string;
  fetchProduct(goodsno: string): Promise<SupplierFetchResult>;
  fetchProducts(query?: SupplierProductsQuery): Promise<SupplierFetchResult>;
}
