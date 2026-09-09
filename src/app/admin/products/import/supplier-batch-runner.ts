export const supplierNames = {
  dome: "친구도매",
  zicgam: "직감",
  ebulsamchon: "이불삼촌",
} as const;
export type BatchSupplier = keyof typeof supplierNames;
type Job = {
  id: string;
  status: string;
  total: number;
  processed: number;
  created: number;
  updated: number;
  unchanged: number;
  errorMessage?: string;
};
export type SupplierRunUpdate = { message: string; jobId?: string };
const progressEvent = "shoppingday:zicgam-catalog-progress";

async function json(url: string, signal: AbortSignal, init?: RequestInit) {
  const response = await fetch(url, { ...init, signal, cache: "no-store" });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body?.error?.message ?? "작업 요청에 실패했습니다.");
  return body;
}

function pause(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const aborted = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", aborted);
      resolve();
    }, 5_000);
    signal.addEventListener("abort", aborted, { once: true });
  });
}

async function waitForJob(
  provider: BatchSupplier,
  jobId: string,
  signal: AbortSignal,
  update: (value: SupplierRunUpdate) => void,
) {
  let failures = 0;
  for (;;) {
    signal.throwIfAborted();
    let job: Job | undefined;
    try {
      job = (await json(`/api/suppliers/${provider}/products/sync`, signal))
        .job;
      failures = 0;
    } catch (error) {
      signal.throwIfAborted();
      if (++failures >= 3) throw error;
      update({
        message: "연결을 다시 확인하고 있습니다. 진행 중인 저장은 계속됩니다.",
        jobId,
      });
      await pause(signal);
      continue;
    }
    if (!job || job.id !== jobId)
      throw new Error(
        "작업 ID가 달라졌습니다. 해당 도매처의 최근 작업을 확인해 주세요.",
      );
    update({
      message: `DB 저장 ${job.processed}/${job.total} · 신규 ${job.created} · 변경 ${job.updated}`,
      jobId,
    });
    if (job.status === "succeeded")
      return `신규 ${job.created} · 변경 ${job.updated} · 동일 ${job.unchanged}`;
    if (job.status === "failed")
      throw new Error(job.errorMessage ?? "DB 저장에 실패했습니다.");
    await pause(signal);
  }
}

function capture(
  provider: Exclude<BatchSupplier, "dome">,
  signal: AbortSignal,
  update: (value: SupplierRunUpdate) => void,
) {
  return new Promise<string>((resolve, reject) => {
    const requestId = crypto.randomUUID();
    let accepted = false;
    const cleanup = () => {
      clearTimeout(startTimer);
      window.removeEventListener(progressEvent, progress);
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      window.dispatchEvent(
        new CustomEvent("shoppingday:zicgam-catalog-stop", {
          detail: { requestId },
        }),
      );
      cleanup();
      reject(signal.reason);
    };
    const progress = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.requestId !== requestId || detail.provider !== provider)
        return;
      accepted = true;
      clearTimeout(startTimer);
      update({
        message:
          detail.message ??
          `상품 확인 ${detail.progress?.processed ?? 0}/${detail.progress?.total ?? "…"}`,
      });
      if (detail.phase === "failed" || detail.phase === "stopped") {
        cleanup();
        reject(new Error(detail.message ?? "수집이 중단되었습니다."));
      }
      if (detail.summary?.jobId && detail.phase === "queued") {
        cleanup();
        resolve(detail.summary.jobId);
      }
    };
    const startTimer = setTimeout(() => {
      if (!accepted) {
        cleanup();
        reject(
          new Error(
            "확장 프로그램 0.5.19 이상을 다시 로드하고 로그인 보관함을 확인해 주세요.",
          ),
        );
      }
    }, 30_000);
    window.addEventListener(progressEvent, progress);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    window.dispatchEvent(
      new CustomEvent("shoppingday:zicgam-catalog-start", {
        detail: { requestId, provider, batchConfirmed: true },
      }),
    );
  });
}

export async function runSupplier(
  provider: BatchSupplier,
  signal: AbortSignal,
  update: (value: SupplierRunUpdate) => void,
) {
  const latest = (
    await json(`/api/suppliers/${provider}/products/sync`, signal)
  ).job as Job | null;
  if (latest && ["queued", "running"].includes(latest.status)) {
    if (provider !== "dome" && latest.status === "queued" && latest.total === 0)
      throw new Error(
        "기존 Chrome 수집 작업이 있습니다. 도매처 카드에서 진행 상태를 확인해 주세요.",
      );
    return waitForJob(provider, latest.id, signal, update);
  }
  const id =
    provider === "dome"
      ? (
          await json("/api/suppliers/dome/products/sync", signal, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ mode: "changes" }),
          })
        ).job.id
      : await capture(provider, signal, update);
  return waitForJob(provider, id, signal, update);
}
