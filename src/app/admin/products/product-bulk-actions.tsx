"use client";

import { useEffect, useRef, useState } from "react";

type BulkJob = {
  id: string;
  type: "upload_images" | "publish";
  status: "queued" | "running" | "completed" | "partial_failed";
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
};

export function ProductBulkActions({ productIds }: { productIds: string[] }) {
  const [job, setJob] = useState<BulkJob | null>(null);
  const [message, setMessage] = useState("");
  const running = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/products/bulk-jobs", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((response) => response.json())
      .then((body) => setJob(body.jobs?.[0] ?? null))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  async function create(type: BulkJob["type"]) {
    const label =
      type === "upload_images" ? "네이버 이미지 업로드" : "스마트스토어 등록";
    if (
      !window.confirm(
        `현재 페이지의 상품 ${productIds.length}개를 ${label} 대기열에 추가할까요?${
          type === "publish"
            ? "\n\n등록 준비가 완료된 상품은 스마트스토어에 실제 등록 또는 수정됩니다."
            : ""
        }`,
      )
    ) {
      return;
    }
    setMessage(`${label} 작업을 만드는 중입니다.`);
    const response = await fetch("/api/products/bulk-jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmed: true, type, productIds }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(body?.error?.message ?? "대량 작업을 만들지 못했습니다.");
      return;
    }
    setJob(body.job);
    setMessage(`${label} 작업을 시작했습니다.`);
    void process(body.job.id);
  }

  async function process(jobId: string) {
    if (running.current) return;
    running.current = true;
    try {
      while (true) {
        const response = await fetch(
          `/api/products/bulk-jobs/${encodeURIComponent(jobId)}/run`,
          { method: "POST" },
        );
        const body = await response.json().catch(() => null);
        if (!response.ok || !body.job) {
          setMessage(
            body?.error?.message ?? "대량 작업을 계속하지 못했습니다.",
          );
          return;
        }
        const next = body.job as BulkJob;
        setJob(next);
        if (
          next.status === "completed" ||
          next.status === "partial_failed"
        ) {
          setMessage(
            next.failed
              ? `${next.succeeded}개 성공 · ${next.failed}개 실패`
              : `${next.succeeded}개 작업을 완료했습니다.`,
          );
          return;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, body.waiting ? 1_000 : 150),
        );
      }
    } finally {
      running.current = false;
    }
  }

  const active = job?.status === "queued" || job?.status === "running";
  return (
    <div className="inventory-bulk-actions">
      <button
        type="button"
        disabled={!productIds.length || active}
        onClick={() => void create("upload_images")}
      >
        현재 페이지 이미지 업로드
      </button>
      <button
        type="button"
        disabled={!productIds.length || active}
        onClick={() => void create("publish")}
      >
        현재 페이지 스마트스토어 등록
      </button>
      {job && active && (
        <button type="button" onClick={() => void process(job.id)}>
          작업 계속
        </button>
      )}
      {job && (
        <span role="status">
          {job.type === "upload_images" ? "이미지" : "상품 등록"} ·{" "}
          {job.processed}/{job.total} · 성공 {job.succeeded} · 실패{" "}
          {job.failed}
        </span>
      )}
      {message && <small>{message}</small>}
    </div>
  );
}
