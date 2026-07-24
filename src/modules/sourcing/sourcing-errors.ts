export class SourcingResearchError extends Error {
  constructor(
    readonly code: "not_found" | "registration_not_ready",
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SourcingResearchError";
  }
}
