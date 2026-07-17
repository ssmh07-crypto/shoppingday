"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type SyncMode = "all" | "changes";
type ProtectedField = "title" | "description" | "images" | "options";
const protectedFieldOptions: Array<{
  value: ProtectedField;
  label: string;
}> = [
  { value: "title", label: "상품명" },
  { value: "description", label: "상세설명" },
  { value: "images", label: "이미지" },
  { value: "options", label: "옵션" },
];
type SyncJob = {
  id: string;
  type: SyncMode;
  status: "queued" | "running" | "succeeded" | "failed";
  dateFrom: string | null;
  dateTo: string | null;
  total: number;
  processed: number;
  created: number;
  updated: number;
  unchanged: number;
  errorMessage: string | null;
  githubRunUrl: string | null;
  requestedAt: string;
  completedAt: string | null;
};

export function ProductSyncControl({
  mode,
  variant = "inventory",
}: {
  mode: SyncMode;
  variant?: "inventory" | "card";
}) {
  const router = useRouter();
  const [job, setJob] = useState<SyncJob | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState(false);
  const [protectedFields, setProtectedFields] = useState<ProtectedField[]>(
    protectedFieldOptions.map((field) => field.value),
  );
  const wasActive = useRef(false);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/suppliers/dome/products/sync", {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) return;
    const next = (body.job ?? null) as SyncJob | null;
    const active = next?.status === "queued" || next?.status === "running";
    if (wasActive.current && next?.status === "succeeded") router.refresh();
    wasActive.current = active;
    setJob(next);
  }, [router]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 5_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [refresh]);

  async function start() {
    const label = mode === "all" ? "전체 상품 가져오기" : "상품 변동처리";
    if (!confirm(`${label} 작업을 시작할까요?`)) return;
    setRequesting(true);
    setError(null);
    try {
      const response = await fetch("/api/suppliers/dome/products/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, protectedFields }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error?.message ?? "작업을 시작하지 못했습니다.");
      }
      setJob(body.job);
      setConfiguring(false);
      wasActive.current = true;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "작업을 시작하지 못했습니다.",
      );
    } finally {
      setRequesting(false);
    }
  }

  const active = job?.status === "queued" || job?.status === "running";
  const percentage =
    job && job.total > 0
      ? Math.min(100, Math.round((job.processed / job.total) * 100))
      : 0;
  const buttonLabel =
    mode === "all"
      ? active
        ? "전체 상품 처리 중…"
        : "전체 상품 가져오기"
      : active
        ? "상품 변동처리 중…"
        : "상품 변동처리";

  return (
    <div className={`product-sync-control ${variant}`}>
      <button
        type="button"
        className={variant === "inventory" ? "inventory-primary-button" : ""}
        onClick={() =>
          mode === "changes" && !active
            ? setConfiguring((current) => !current)
            : void start()
        }
        disabled={requesting || active}
      >
        <SyncIcon />
        {requesting ? "작업 요청 중…" : buttonLabel}
      </button>
      {mode === "changes" && configuring && !active && (
        <div className="product-sync-settings">
          <strong>변경하지 않을 항목</strong>
          <div className="product-sync-field-grid">
            {protectedFieldOptions.map((field) => (
              <label key={field.value}>
                <input
                  type="checkbox"
                  checked={protectedFields.includes(field.value)}
                  onChange={(event) =>
                    setProtectedFields((current) =>
                      event.target.checked
                        ? [...current, field.value]
                        : current.filter((value) => value !== field.value),
                    )
                  }
                />
                {field.label}
              </label>
            ))}
          </div>
          <small>체크를 해제한 항목만 공급처 최신값으로 갱신됩니다.</small>
          <button type="button" onClick={() => void start()} disabled={requesting}>
            변동처리 시작
          </button>
        </div>
      )}
      {(job || error) && (
        <div className="product-sync-status" aria-live="polite">
          {error ? (
            <p className="error">{error}</p>
          ) : job ? (
            <>
              <strong>{jobTitle(job)}</strong>
              <span>{jobStatus(job)}</span>
              {active && (
                <div className="product-sync-progress">
                  <progress
                    value={job.total > 0 ? job.processed : undefined}
                    max={job.total > 0 ? job.total : undefined}
                  />
                  <small>
                    {job.total > 0
                      ? `${percentage}% · ${job.processed.toLocaleString("ko-KR")} / ${job.total.toLocaleString("ko-KR")}개`
                      : "처리할 상품을 조회하고 있습니다."}
                  </small>
                </div>
              )}
              {job.status === "succeeded" && (
                <small>
                  조회 {job.total.toLocaleString("ko-KR")}개 · 신규{" "}
                  {job.created.toLocaleString("ko-KR")}개 · 변경{" "}
                  {job.updated.toLocaleString("ko-KR")}개 · 동일{" "}
                  {job.unchanged.toLocaleString("ko-KR")}개
                </small>
              )}
              {job.errorMessage && (
                <small className="error">{job.errorMessage}</small>
              )}
              {job.githubRunUrl && (
                <a href={job.githubRunUrl} target="_blank" rel="noreferrer">
                  실행 로그 보기
                </a>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

function jobTitle(job: SyncJob) {
  return job.type === "all" ? "전체 상품 가져오기" : "상품 변동처리";
}

function jobStatus(job: SyncJob) {
  if (job.status === "queued")
    return "GitHub Actions 실행을 기다리고 있습니다.";
  if (job.status === "running") {
    return job.total
      ? `${job.processed.toLocaleString("ko-KR")} / ${job.total.toLocaleString("ko-KR")} 처리 중`
      : "친구도매 상품을 조회하고 있습니다.";
  }
  if (job.status === "succeeded") return "작업이 완료되었습니다.";
  return "작업에 실패했습니다.";
}

function SyncIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 7h-5V2" />
      <path d="M20 2a9 9 0 1 0 2 10" />
    </svg>
  );
}
