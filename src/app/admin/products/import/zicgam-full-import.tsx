"use client";

import { useEffect, useMemo, useState } from "react";

const STATUS_EVENT = "shoppingday:rank-extension-status";
const PING_EVENT = "shoppingday:rank-extension-ping";
const START_EVENT = "shoppingday:zicgam-catalog-start";
const STOP_EVENT = "shoppingday:zicgam-catalog-stop";
const PROGRESS_EVENT = "shoppingday:zicgam-catalog-progress";

type Phase =
  | "idle"
  | "starting"
  | "discovering"
  | "importing"
  | "stopping"
  | "complete"
  | "failed";

interface CatalogProgressDetail {
  requestId?: string;
  phase?: string;
  message?: string;
  progress?: {
    listPages?: number;
    pendingListPages?: number;
    discoveredProducts?: number;
    processed?: number;
    total?: number;
  };
  result?: { action?: "created" | "updated" | "unchanged" };
  summary?: {
    total: number;
    processed: number;
    succeeded: number;
    failed: number;
  };
}

export function ZicgamFullImport() {
  const [extension, setExtension] = useState({ available: false, version: null as string | null });
  const [requestId, setRequestId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<CatalogProgressDetail["progress"]>();
  const [counts, setCounts] = useState({ created: 0, updated: 0, unchanged: 0, failed: 0 });

  useEffect(() => {
    function onStatus(event: Event) {
      const detail = (event as CustomEvent<{ available?: boolean; version?: string | null }>).detail;
      setExtension({ available: detail?.available === true, version: detail?.version ?? null });
    }
    function onProgress(event: Event) {
      const detail = (event as CustomEvent<CatalogProgressDetail>).detail;
      if (!detail || (requestId && detail.requestId !== requestId)) return;
      if (detail.progress) setProgress(detail.progress);
      if (detail.phase === "discovering") setPhase("discovering");
      if (detail.phase === "discovery_complete") {
        setPhase("discovering");
        setMessage(`현재 직감 목록에서 상품 ${detail.progress?.discoveredProducts ?? 0}개를 발견했습니다.`);
      }
      if (detail.phase === "importing") {
        setPhase("importing");
        const action = detail.result?.action;
        if (action) setCounts((current) => ({ ...current, [action]: current[action] + 1 }));
      }
      if (detail.phase === "item_failed") {
        setCounts((current) => ({ ...current, failed: current.failed + 1 }));
        setMessage(detail.message ?? "일부 상품을 가져오지 못했습니다.");
      }
      if (detail.phase === "complete") {
        setPhase("complete");
        setMessage(
          `직감 상품 ${detail.summary?.succeeded ?? 0}개를 저장했고 ${detail.summary?.failed ?? 0}개는 실패했습니다.`,
        );
      }
      if (detail.phase === "stopped") {
        setPhase("idle");
        setMessage("직감 전체 상품 가져오기를 중단했습니다. 다시 실행하면 기존 상품은 중복 생성하지 않고 확인합니다.");
      }
      if (detail.phase === "failed") {
        setPhase("failed");
        setMessage(detail.message ?? "직감 전체 상품 가져오기에 실패했습니다.");
      }
    }
    window.addEventListener(STATUS_EVENT, onStatus);
    window.addEventListener(PROGRESS_EVENT, onProgress);
    window.dispatchEvent(new CustomEvent(PING_EVENT));
    return () => {
      window.removeEventListener(STATUS_EVENT, onStatus);
      window.removeEventListener(PROGRESS_EVENT, onProgress);
    };
  }, [requestId]);

  const extensionReady = extension.available && isMinimumVersion(extension.version, "0.4.2");
  const running = ["starting", "discovering", "importing", "stopping"].includes(phase);
  const percent = useMemo(() => {
    const total = progress?.total ?? 0;
    const processed = progress?.processed ?? 0;
    return total ? Math.min(100, Math.round((processed / total) * 100)) : 0;
  }, [progress]);

  function start() {
    if (!extensionReady || running) return;
    if (!confirm("로그인된 직감 계정으로 전체 상품을 순차 수집할까요? 작업 중에는 Shoppingday와 직감 탭을 닫지 마세요.")) return;
    const id = crypto.randomUUID();
    setRequestId(id);
    setPhase("starting");
    setMessage("직감 카테고리와 상품 주소를 찾고 있습니다.");
    setProgress(undefined);
    setCounts({ created: 0, updated: 0, unchanged: 0, failed: 0 });
    window.dispatchEvent(new CustomEvent(START_EVENT, { detail: { requestId: id } }));
  }

  function stop() {
    if (!running) return;
    setPhase("stopping");
    setMessage("중단을 요청했습니다. 현재 처리 중인 페이지가 끝나면 멈춥니다.");
    window.dispatchEvent(new CustomEvent(STOP_EVENT, { detail: { requestId } }));
  }

  return (
    <section className="card" aria-live="polite">
      <h2>직감 전체 상품 가져오기</h2>
      <p>
        Chrome에 로그인된 직감 승인 계정으로 카테고리와 상품 상세 페이지를 순차
        확인합니다. 새 상품은 추가하고 기존 상품은 공급처 원본 정보만 갱신합니다.
      </p>
      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" onClick={start} disabled={!extensionReady || running}>
          {running ? "전체 상품 처리 중…" : "직감 전체 상품 가져오기"}
        </button>
        {running && (
          <button type="button" className="secondary" onClick={stop}>
            중단
          </button>
        )}
      </div>
      <p className={`notice${extensionReady ? "" : " error"}`}>
        {extensionReady
          ? `Chrome 확장 프로그램 ${extension.version ?? ""} 연결됨`
          : `Chrome 확장 프로그램 0.4.2 이상이 필요합니다${extension.version ? ` (현재 ${extension.version})` : ""}. 확장을 다시 로드하고 이 페이지를 강력 새로고침해 주세요.`}
      </p>
      {phase === "discovering" && (
        <p className="notice">
          목록 {progress?.listPages ?? 0}페이지 확인 · 상품 {progress?.discoveredProducts ?? 0}개 발견
        </p>
      )}
      {(phase === "importing" || phase === "stopping") && (
        <>
          <progress value={percent} max={100} style={{ width: "100%" }} />
          <p className="notice">
            {progress?.processed ?? 0} / {progress?.total ?? 0} · 신규 {counts.created} · 갱신 {counts.updated} · 변경 없음 {counts.unchanged} · 실패 {counts.failed}
          </p>
        </>
      )}
      {message && (
        <p className={`notice${phase === "failed" ? " error" : ""}`}>{message}</p>
      )}
      <p className="notice">
        전체 가져오기는 상품 수에 따라 오래 걸릴 수 있습니다. 수집된 상품이 스마트스토어에 자동 등록되지는 않습니다.
      </p>
    </section>
  );
}

function isMinimumVersion(current: string | null, minimum: string) {
  if (!current) return false;
  const left = current.split(".").map(Number);
  const right = minimum.split(".").map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference) return difference > 0;
  }
  return true;
}
