export class ProductNotFoundError extends Error { readonly code='product_not_found'; constructor(){super('상품을 찾을 수 없습니다.')} }
export class ProductConflictError extends Error { readonly code='product_conflict'; constructor(){super('다른 화면에서 상품이 수정되었습니다. 최신 내용을 불러온 뒤 다시 저장해 주세요.')} }
export class ProductValidationError extends Error { readonly code='product_validation'; constructor(readonly errors:Record<string,string>){super('상품 정보를 확인해 주세요.')} }
