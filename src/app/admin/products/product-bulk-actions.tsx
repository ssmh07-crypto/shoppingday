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
  failures?: { productId: string; title: string; message: string | null }[];
};

export function ProductBulkActions({ productIds }: { productIds: string[] }) {
  const [job, setJob] = useState<BulkJob | null>(null);
  const [message, setMessage] = useState("");
  const running = useRef(false);
  const creating = useRef(false);
  const [requesting, setRequesting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [background, setBackground] = useState(false);
  const [useServer, setUseServer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [needsReload, setNeedsReload] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    const controller = new AbortController();
    mounted.current = true;
    void fetch("/api/products/bulk-jobs", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("이전 작업을 조회하지 못했습니다.");
        return response.json();
      })
      .then((body) => {
        const jobs = (body.jobs ?? []) as BulkJob[];
        setJob(
          jobs.find(
            (item) => item.status === "queued" || item.status === "running",
          ) ??
            jobs[0] ??
            null,
        );
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setNeedsReload(true);
          setMessage(
            error instanceof Error
              ? error.message
              : "이전 작업을 조회하지 못했습니다.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!background || !job || !["queued", "running"].includes(job.status)) return;
    const controller = new AbortController();
    const timer = setInterval(() => {
      void fetch("/api/products/bulk-jobs", { cache: "no-store", signal: controller.signal })
        .then(response => { if (!response.ok) throw new Error(); return response.json(); })
        .then(body => {
          const current = (body.jobs as BulkJob[]).find(item => item.id === job.id);
          if (current) setJob(current);
        }).catch(() => { if (!controller.signal.aborted) setMessage("진행 상태 조회에 실패했습니다. 서버 작업은 계속될 수 있습니다."); });
    }, 5000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [background, job]);

  async function runInBackground(jobId: string) {
    if (running.current) return;
    setRequesting(true);
    try {
      const response = await fetch(`/api/products/bulk-jobs/${encodeURIComponent(jobId)}/background`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "서버 실행 접수 실패");
      setBackground(true);
      setMessage("서버 실행을 접수했습니다. 화면을 닫아도 이어서 처리합니다. 네이버 릴레이 PC는 켜 두세요.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "서버 실행 접수 실패");
    } finally { setRequesting(false); }
  }

  async function create(type: BulkJob["type"], requestedIds = productIds) {
    if (
      creating.current ||
      running.current ||
      loading ||
      needsReload ||
      !requestedIds.length
    )
      return;
    const label =
      type === "upload_images" ? "네이버 이미지 업로드" : "스마트스토어 등록";
    if (
      !window.confirm(
        `선택한 상품 ${requestedIds.length}개를 ${label} 대기열에 추가할까요?${
          type === "publish"
            ? "\n\n등록 준비가 완료된 상품은 스마트스토어에 실제 등록 또는 수정됩니다."
            : ""
        }`,
      )
    ) {
      return;
    }
    creating.current = true;
    setRequesting(true);
    try {
      setMessage(`${label} 작업을 만드는 중입니다.`);
      const response = await fetch("/api/products/bulk-jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmed: true, type, productIds: requestedIds }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.job) {
        setMessage(body?.error?.message ?? "대량 작업을 만들지 못했습니다.");
        return;
      }
      setJob(body.job);
      setMessage(`${label} 작업을 시작했습니다.`);
      setBackground(false);
      if (useServer) await runInBackground(body.job.id);
      else void process(body.job.id);
    } catch {
      setNeedsReload(true);
      setMessage(
        "연결이 끊겼습니다. 새로고침해 기존 작업을 확인한 뒤 계속하세요.",
      );
    } finally {
      creating.current = false;
      setRequesting(false);
    }
  }

  async function process(jobId: string) {
    if (running.current) return;
    running.current = true;
    setProcessing(true);
    try {
      while (mounted.current) {
        const response = await fetch(
          `/api/products/bulk-jobs/${encodeURIComponent(jobId)}/run`,
          { method: "POST" },
        );
        const body = await response.json().catch(() => null);
        if (!response.ok || !body?.job) {
          setMessage(
            body?.error?.message ?? "대량 작업을 계속하지 못했습니다.",
          );
          return;
        }
        const next = body.job as BulkJob;
        setJob(next);
        if (next.status === "completed" || next.status === "partial_failed") {
          if (next.failed) {
            const summaryResponse = await fetch("/api/products/bulk-jobs", { cache: "no-store" });
            if (summaryResponse.ok) {
              const summary = await summaryResponse.json();
              const completed = (summary.jobs as BulkJob[]).find(item => item.id === jobId);
              if (completed) setJob(completed);
            }
          }
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
    } catch {
      if (mounted.current)
        setMessage(
          "연결이 끊겨 작업을 멈췄습니다. 작업 계속을 눌러 남은 상품을 처리하세요.",
        );
    } finally {
      running.current = false;
      if (mounted.current) setProcessing(false);
    }
  }

  const active = job?.status === "queued" || job?.status === "running";
  return (
    <div className="inventory-bulk-actions">
      <label><input type="checkbox" checked={useServer} disabled={active || requesting || loading} onChange={event => setUseServer(event.target.checked)} /> 화면을 닫아도 서버에서 처리</label>
      <button
        type="button"
        disabled={
          !productIds.length || active || requesting || loading || needsReload
        }
        onClick={() => void create("upload_images")}
      >
        선택 상품 이미지 업로드
      </button>
      <button
        type="button"
        disabled={
          !productIds.length || active || requesting || loading || needsReload
        }
        onClick={() => void create("publish")}
      >
        선택 상품 스마트스토어 등록
      </button>
      {job && active && (
        <button type="button" disabled={processing || requesting || background} onClick={() => void runInBackground(job.id)}>
          {background ? "서버 실행 접수됨" : "서버에서 계속"}
        </button>
      )}
      {job && active && (
        <button
          type="button"
          disabled={processing || requesting || background}
          onClick={() => void process(job.id)}
        >
          {processing ? "처리 중…" : "작업 계속"}
        </button>
      )}
      {job && (
        <span role="status">
          {job.type === "upload_images" ? "이미지" : "상품 등록"} ·{" "}
          {job.processed}/{job.total} · 성공 {job.succeeded} · 실패 {job.failed}
        </span>
      )}
      {message && <small>{message}</small>}
      {!!job?.failures?.length && <div><ul>{job.failures.map(item => <li key={item.productId}><a href={`/admin/products/${item.productId}/edit`}>{item.title}</a> · {item.message}</li>)}</ul><button type="button" disabled={active || requesting || processing} onClick={() => void create(job.type, job.failures!.map(item => item.productId))}>실패한 {job.failures.length}개만 다시 처리</button></div>}
      {active && (
        <small>
          화면에서 처리하거나 서버에서 계속할 수 있습니다. 서버 실행에는 연결 설정과 릴레이 PC 가동이 필요합니다.
        </small>
      )}
    </div>
  );
}
