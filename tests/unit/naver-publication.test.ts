import { describe, expect, it } from "vitest";
import type { ProductPublicationRow } from "@/lib/db/schema";
import { planNaverPublication } from "@/modules/channels/naver/naver-publication";

const currentHash = "a".repeat(64);
const changedHash = "b".repeat(64);

function publication(
  overrides: Partial<ProductPublicationRow> = {},
): ProductPublicationRow {
  const now = new Date("2026-07-18T00:00:00.000Z");
  return {
    id: "00000000-0000-4000-8000-000000000001",
    productId: "00000000-0000-4000-8000-000000000002",
    channel: "naver",
    status: "published",
    originProductNo: "100000001",
    channelProductNo: "200000001",
    lastPayloadHash: currentHash,
    attemptedPayloadHash: currentHash,
    lastRequestId: "00000000-0000-4000-8000-000000000003",
    attemptCount: 1,
    lastErrorCode: null,
    lastErrorMessage: null,
    lastErrorHttpStatus: null,
    lastAttemptedAt: now,
    publishedAt: now,
    lastSyncedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("네이버 상품 발행 계획", () => {
  it("발행 이력이 없거나 삭제된 상품은 신규 등록으로 판단한다", () => {
    expect(planNaverPublication(null, currentHash)).toBe("create");
    expect(
      planNaverPublication(publication({ status: "deleted" }), currentHash),
    ).toBe("create");
  });

  it("처리 중인 발행과 삭제는 중복 요청을 막는다", () => {
    expect(
      planNaverPublication(publication({ status: "publishing" }), currentHash),
    ).toBe("blocked");
    expect(
      planNaverPublication(publication({ status: "deleting" }), currentHash),
    ).toBe("blocked");
  });

  it("네이버가 거부한 등록은 수정 후 재시도할 수 있다", () => {
    expect(
      planNaverPublication(
        publication({
          status: "failed",
          originProductNo: null,
          lastErrorHttpStatus: 400,
        }),
        currentHash,
      ),
    ).toBe("retry_create");
  });

  it("응답 유실 가능성이 있는 실패는 중복 등록 방지를 위해 차단한다", () => {
    expect(
      planNaverPublication(
        publication({
          status: "failed",
          originProductNo: null,
          lastErrorHttpStatus: 504,
        }),
        currentHash,
      ),
    ).toBe("blocked");
  });

  it("발행된 payload 해시가 같으면 전송하지 않고 변경되면 수정 대상으로 판단한다", () => {
    expect(planNaverPublication(publication(), currentHash)).toBe("unchanged");
    expect(planNaverPublication(publication(), changedHash)).toBe("update");
  });

  it("외부 상품번호가 있는 실패 상태는 수정 재시도로 판단한다", () => {
    expect(
      planNaverPublication(publication({ status: "failed" }), currentHash),
    ).toBe("update");
  });
});
