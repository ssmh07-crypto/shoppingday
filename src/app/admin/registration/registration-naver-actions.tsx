"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function RegistrationNaverActions({
  productId,
  title,
  editHref,
  channelProductNo,
  publicationStatus,
  remoteStatusType,
  connected,
}: {
  productId: string;
  title: string;
  editHref: string;
  channelProductNo: string | null;
  publicationStatus: string | null;
  remoteStatusType: string | null;
  connected: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const hasRemoteProduct =
    Boolean(channelProductNo) && publicationStatus !== "deleted";

  async function publishOrUpdate() {
    setBusy("publish");
    setMessage("등록 상태 확인 중…");
    try {
      const inspectionResponse = await fetch(
        `/api/products/${productId}/naver-publication`,
        { cache: "no-store" },
      );
      const inspectionBody = await inspectionResponse.json().catch(() => null);
      if (!inspectionResponse.ok) {
        throw new Error(
          inspectionBody?.error?.message ?? "등록 상태를 확인하지 못했습니다.",
        );
      }
      const inspection = inspectionBody.inspection;
      if (!inspection?.ready || !inspection.payloadHash) {
        const issue = inspection?.issues?.[0]?.message;
        throw new Error(issue ?? "상품 정보와 판매 정책을 먼저 완성해 주세요.");
      }
      if (inspection.action === "unchanged") {
        setMessage("이미 스마트스토어 최신 상태입니다.");
        return;
      }
      if (!["create", "retry_create", "update"].includes(inspection.action)) {
        throw new Error("현재 등록 요청을 처리할 수 없는 상태입니다.");
      }
      const updating = inspection.action === "update";
      if (
        !window.confirm(
          `[스마트스토어 ${updating ? "변경" : "등록"}]\n\n${title}\n\n실제 스마트스토어 상품에 반영할까요?`,
        )
      ) {
        setMessage("");
        return;
      }
      setMessage(
        updating
          ? "스마트스토어 상품을 변경하는 중…"
          : "스마트스토어에 등록하는 중…",
      );
      const response = await fetch(
        `/api/products/${productId}/naver-publication`,
        {
          method: updating ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            confirmed: true,
            payloadHash: inspection.payloadHash,
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          body?.error?.message ?? "스마트스토어 반영에 실패했습니다.",
        );
      }
      setMessage(updating ? "변경 완료" : "등록 완료");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "스마트스토어 처리 실패",
      );
    } finally {
      setBusy("");
    }
  }

  async function changeStatus(
    statusType: "SALE" | "OUTOFSTOCK" | "SUSPENSION",
  ) {
    const label =
      statusType === "SALE"
        ? "판매 재개"
        : statusType === "OUTOFSTOCK"
          ? "품절"
          : "판매 중지";
    if (
      !window.confirm(
        `[스마트스토어 ${label}]\n\n${title}\n\n실제 판매 상태를 변경할까요?`,
      )
    ) {
      return;
    }
    setBusy(statusType);
    setMessage(`${label} 처리 중…`);
    try {
      const response = await fetch(
        `/api/products/${productId}/naver-publication`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ confirmed: true, statusType }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          body?.error?.message ?? `${label} 처리에 실패했습니다.`,
        );
      }
      setMessage(`${label} 완료`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${label} 실패`);
    } finally {
      setBusy("");
    }
  }

  async function remove() {
    if (
      !window.confirm(
        `[스마트스토어 상품 삭제]\n\n${title}\n\n채널 상품과 원상품을 실제로 삭제할까요?`,
      )
    ) {
      return;
    }
    setBusy("delete");
    setMessage("스마트스토어 상품 삭제 중…");
    try {
      const response = await fetch(
        `/api/products/${productId}/naver-publication`,
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ confirmed: true }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          body?.error?.message ?? "스마트스토어 상품 삭제에 실패했습니다.",
        );
      }
      setMessage("삭제 완료");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "스마트스토어 상품 삭제 실패",
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="registration-quick-actions">
      <div>
        <Link href={editHref}>편집</Link>
        <button
          type="button"
          disabled={!connected || Boolean(busy)}
          onClick={() => void publishOrUpdate()}
        >
          {busy === "publish" ? "처리 중…" : hasRemoteProduct ? "변경" : "등록"}
        </button>
        {hasRemoteProduct && (
          <>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() =>
                void changeStatus(
                  remoteStatusType === "OUTOFSTOCK" ? "SALE" : "OUTOFSTOCK",
                )
              }
            >
              {remoteStatusType === "OUTOFSTOCK" ? "판매재개" : "품절"}
            </button>
            <button
              type="button"
              className="danger"
              disabled={Boolean(busy)}
              onClick={() => void remove()}
            >
              삭제
            </button>
          </>
        )}
      </div>
      {message && <small role="status">{message}</small>}
    </div>
  );
}
