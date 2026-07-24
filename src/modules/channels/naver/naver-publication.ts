import type { ProductPublicationRow } from "@/lib/db/schema";

export type NaverPublicationAction =
  | "create"
  | "retry_create"
  | "update"
  | "unchanged"
  | "blocked";

export function planNaverPublication(
  publication: ProductPublicationRow | null,
  payloadHash: string,
): NaverPublicationAction {
  if (!publication || publication.status === "deleted") return "create";
  if (
    publication.status === "publishing" ||
    publication.status === "deleting"
  ) {
    return "blocked";
  }
  if (!publication.originProductNo) {
    if (
      publication.status === "failed" &&
      (publication.lastErrorHttpStatus === null ||
        publication.lastErrorHttpStatus >= 500)
    ) {
      return "blocked";
    }
    return publication.status === "failed" ? "retry_create" : "create";
  }
  return publication.status === "published" &&
    publication.lastPayloadHash === payloadHash
    ? "unchanged"
    : "update";
}
