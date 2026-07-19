export class SourcingResearchError extends Error {
  constructor(
    readonly code: "not_found",
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SourcingResearchError";
  }
}
