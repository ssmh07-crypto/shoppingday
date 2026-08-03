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
  restored?: boolean;
  updatedAt?: number;
  counts?: { created: number; updated: number; unchanged: number; failed: number };
  progress?: {
    listPages?: number;
    currentPage?: number;
    lastPage?: number;
    terminalEmptyPage?: number;
    pageItemCount?: number;
    current?: number;
    discoveredProducts?: number;
    displayedTotal?: number | null;
    verificationSource?: "empty_page" | "empty_page_and_site_total";
    hasNextPage?: boolean;
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
  const [lastActivityAt, setLastActivityAt] = useState<number | null>(null);
  const [importStartedAt, setImportStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    function onStatus(event: Event) {
      const detail = (event as CustomEvent<{ available?: boolean; version?: string | null }>).detail;
      setExtension({ available: detail?.available === true, version: detail?.version ?? null });
    }
    function onProgress(event: Event) {
      const detail = (event as CustomEvent<CatalogProgressDetail>).detail;
      if (!detail || (requestId && detail.requestId !== requestId)) return;
      if (!requestId && detail.requestId) setRequestId(detail.requestId);
      setLastActivityAt(detail.updatedAt ?? Date.now());
      if (detail.counts) setCounts(detail.counts);
      if (detail.progress) setProgress(detail.progress);
      if (detail.phase === "starting") {
        setPhase("starting");
        setMessage(detail.message ?? "직감 전체 가져오기를 시작하고 있습니다.");
      }
      if (detail.phase === "discovering") setPhase("discovering");
      if (detail.phase === "discovery_complete") {
        setPhase("discovering");
        setMessage(
          `직감 전체상품 ${detail.progress?.listPages ?? 0}페이지에서 상품 ${detail.progress?.discoveredProducts ?? 0}개를 확인했고 ${detail.progress?.terminalEmptyPage ?? 0}페이지가 비어 있어 목록의 끝으로 판정했습니다.`,
        );
      }
      if (detail.phase === "importing") {
        setPhase("importing");
        setImportStartedAt((current) => current ?? Date.now());
        if (detail.message) setMessage(detail.message);
        const action = detail.result?.action;
        if (action && !detail.restored) {
          setCounts((current) => ({ ...current, [action]: current[action] + 1 }));
        }
      }
      if (detail.phase === "item_failed") {
        if (!detail.restored) {
          setCounts((current) => ({ ...current, failed: current.failed + 1 }));
        }
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

  const extensionReady = extension.available && isMinimumVersion(extension.version, "0.4.9");
  const running = ["starting", "discovering", "importing", "stopping"].includes(phase);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [running]);
  const percent = useMemo(() => {
    const total = progress?.total ?? 0;
    const processed = progress?.processed ?? 0;
    return total ? Math.min(100, Math.round((processed / total) * 100)) : 0;
  }, [progress]);
  const inactiveSeconds = lastActivityAt
    ? Math.max(0, Math.floor((now - lastActivityAt) / 1_000))
    : 0;
  const estimatedMinutes = useMemo(() => {
    const processed = progress?.processed ?? 0;
    const total = progress?.total ?? 0;
    if (!importStartedAt || processed < 1 || total <= processed) return null;
    const averageMilliseconds = Math.max(0, now - importStartedAt) / processed;
    return Math.max(1, Math.ceil((averageMilliseconds * (total - processed)) / 60_000));
  }, [importStartedAt, now, progress]);

  function start() {
    if (!extensionReady || running) return;
    if (!confirm("로그인된 직감 계정으로 전체 상품을 순차 수집할까요? 작업 중에는 Shoppingday와 직감 탭을 닫지 마세요.")) return;
    const id = crypto.randomUUID();
    setRequestId(id);
    setPhase("starting");
    setMessage("직감 카테고리와 상품 주소를 찾고 있습니다.");
    setProgress(undefined);
    setCounts({ created: 0, updated: 0, unchanged: 0, failed: 0 });
    setLastActivityAt(Date.now());
    setImportStartedAt(null);
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
        Chrome에 로그인된 직감 승인 계정으로 전체상품 목록과 상품 상세 페이지를 순차
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
          : `Chrome 확장 프로그램 0.4.9 이상이 필요합니다${extension.version ? ` (현재 ${extension.version})` : ""}. 확장을 다시 로드하고 이 페이지를 강력 새로고침해 주세요.`}
      </p>
      {phase === "discovering" && (
        <p className="notice">
          전체상품 목록 {progress?.currentPage ?? progress?.listPages ?? 0}페이지 확인 · 현재 페이지 {progress?.pageItemCount ?? 0}개 · 고유 상품 {progress?.discoveredProducts ?? 0}개
          {progress?.displayedTotal !== null && progress?.displayedTotal !== undefined
            ? ` · 사이트 표시 전체 ${progress.displayedTotal}개`
            : ""}
        </p>
      )}
      {(phase === "importing" || phase === "stopping") && (
        <>
          <progress value={percent} max={100} style={{ width: "100%" }} />
          <p className="notice">
            {progress?.processed ?? 0} / {progress?.total ?? 0} · 신규 {counts.created} · 갱신 {counts.updated} · 변경 없음 {counts.unchanged} · 실패 {counts.failed}
            {progress?.current ? ` · 현재 ${progress.current}번째 상품 확인 중` : ""}
            {` · 마지막 응답 ${inactiveSeconds}초 전`}
            {estimatedMinutes ? ` · 예상 잔여 약 ${estimatedMinutes}분` : ""}
          </p>
          {inactiveSeconds >= 120 && (
            <p className="notice error">
              2분 이상 진행 응답이 없습니다. 직감 작업 탭의 로그인 상태와 오류 화면을 확인해 주세요.
            </p>
          )}
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
