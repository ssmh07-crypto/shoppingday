export class KeywordManagementError extends Error {
  constructor(
    readonly code:
      | "not_found"
      | "invalid_smartstore_url"
      | "duplicate_product"
      | "external_api_not_configured"
      | "analysis_required"
      | "product_type_review_required"
      | "keywords_required"
      | "invalid_selection"
      | "external_api_error",
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "KeywordManagementError";
  }
}
