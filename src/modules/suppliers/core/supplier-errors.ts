export type SupplierErrorCode =
  | 'supplier_timeout'
  | 'supplier_auth_error'
  | 'supplier_rate_limit'
  | 'supplier_empty_response'
  | 'supplier_invalid_xml'
  | 'supplier_product_not_found'
  | 'supplier_response_too_large'
  | 'supplier_invalid_content_type'
  | 'supplier_http_error'

export class SupplierError extends Error {
  constructor(
    public readonly code: SupplierErrorCode,
    message: string,
    public readonly responseStatus: number | null = null,
  ) {
    super(message)
    this.name = 'SupplierError'
  }
}
