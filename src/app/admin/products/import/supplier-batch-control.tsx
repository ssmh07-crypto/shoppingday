"use client";
import { useEffect, useRef, useState } from "react";
import { SupplierBrowserSchedule } from "./supplier-browser-schedule";
import type { SupplierChangeKind } from "@/modules/suppliers/core/change-application-policy";
import {
  runSupplier,
  supplierNames,
  type BatchSupplier,
} from "./supplier-batch-runner";

type State = {
  status: "waiting" | "running" | "done" | "failed" | "stopped";
  message: string;
};
const providers = Object.keys(supplierNames) as BatchSupplier[];
export function SupplierBatchControl() {
  const [selected, setSelected] = useState<BatchSupplier[]>([]);
  const [states, setStates] = useState<Partial<Record<BatchSupplier, State>>>(
    {},
  );
  const [running, setRunning] = useState(false);
  const [extensionVersion, setExtensionVersion] = useState("");
  const controller = useRef<AbortController | null>(null);
  const versionParts = extensionVersion.split(".").map(Number);
  const extensionReady =
    versionParts.length === 3 &&
    (versionParts[0] > 0 ||
      versionParts[1] > 5 ||
      (versionParts[1] === 5 && versionParts[2] >= 19));
  useEffect(() => {
    const selectionTimer = window.setTimeout(() => {
      try {
        const stored: unknown = JSON.parse(
          localStorage.getItem("shoppingday:supplier-selection") ?? "[]",
        );
        if (Array.isArray(stored))
          setSelected([
            ...new Set(
              stored.filter((key): key is BatchSupplier =>
                providers.includes(key as BatchSupplier),
              ),
            ),
          ]);
      } catch {
        /* Selection persistence is optional. */
      }
    }, 0);
    const status = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.available) setExtensionVersion(detail.version ?? "");
    };
    window.addEventListener("shoppingday:rank-extension-status", status);
    window.dispatchEvent(new CustomEvent("shoppingday:rank-extension-ping"));
    return () => {
      window.clearTimeout(selectionTimer);
      controller.current?.abort();
      window.removeEventListener("shoppingday:rank-extension-status", status);
    };
  }, []);
  function choose(next: BatchSupplier[]) {
    setSelected(next);
    try {
      localStorage.setItem(
        "shoppingday:supplier-selection",
        JSON.stringify(next),
      );
    } catch {
      /* Optional. */
    }
  }
  async function start(
    targets = selected,
    scheduled = false,
    getKinds?: () => SupplierChangeKind[],
  ) {
    if (controller.current || !targets.length) return;
    if (targets.some((key) => key !== "dome") && !extensionReady) {
      alert(
        "Chrome 확장 프로그램 0.5.19 이상을 다시 로드한 뒤 이 화면을 새로고침해 주세요.",
      );
      return;
    }
    if (
      !scheduled &&
      !confirm(
        `${targets.map((key) => supplierNames[key]).join(", ")}의 신규·변경 상품을 확인할까요? Chrome 수집 도매처는 이 화면을 열어 두세요.`,
      )
    )
      return;
    const current = new AbortController();
    controller.current = current;
    setRunning(true);
    window.dispatchEvent(
      new CustomEvent("shoppingday:supplier-batch-state", {
        detail: { running: true },
      }),
    );
    setStates((previous) => ({
      ...previous,
      ...Object.fromEntries(
        targets.map((key) => [
          key,
          { status: "waiting", message: "실행 대기" },
        ]),
      ),
    }));
    try {
      for (const provider of targets) {
        if (current.signal.aborted) break;
        setStates((previous) => ({
          ...previous,
          [provider]: { status: "running", message: "최근 작업 확인 중…" },
        }));
        try {
          const signal = AbortSignal.any([
            current.signal,
            AbortSignal.timeout(6 * 60 * 60 * 1000),
          ]);
          const message = await runSupplier(provider, signal, (update) =>
            setStates((previous) => ({
              ...previous,
              [provider]: { status: "running", message: update.message },
            })),
          );
          if (getKinds) {
            for (
              let count = 0;
              count < 1000 && !current.signal.aborted;
              count++
            ) {
              const kinds = getKinds();
              if (!kinds.length) break;
              const response = await fetch(
                "/api/products/supplier-change-applications",
                {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    confirmed: true,
                    kinds,
                    supplierCode: provider,
                  }),
                  signal: current.signal,
                },
              );
              const body = await response.json();
              if (!response.ok || body.result?.status === "failed")
                throw new Error(
                  body.result?.message ??
                    "수집 완료 · 스마트스토어 변경 반영 실패",
                );
              if (["idle", "busy"].includes(body.result.status)) break;
              setStates((previous) => ({
                ...previous,
                [provider]: {
                  status: "running",
                  message: `수집 완료 · 변경 반영 ${count + 1}건 처리`,
                },
              }));
            }
          }
          setStates((previous) => ({
            ...previous,
            [provider]: { status: "done", message },
          }));
        } catch (error) {
          setStates((previous) => ({
            ...previous,
            [provider]: {
              status: current.signal.aborted ? "stopped" : "failed",
              message: current.signal.aborted
                ? "중단 요청 완료 · 시작된 DB 저장은 계속됩니다."
                : error instanceof Error
                  ? error.message
                  : "도매처 연결을 확인해 주세요.",
            },
          }));
        }
      }
    } finally {
      if (current.signal.aborted)
        setStates((previous) =>
          Object.fromEntries(
            Object.entries(previous).map(([key, value]) => [
              key,
              value.status === "waiting"
                ? { status: "stopped", message: "실행하지 않음" }
                : value,
            ]),
          ),
        );
      controller.current = null;
      setRunning(false);
      window.dispatchEvent(
        new CustomEvent("shoppingday:supplier-batch-state", {
          detail: { running: false },
        }),
      );
    }
  }
  const failed = providers.filter((key) => states[key]?.status === "failed");
  return (
    <section className="supplier-batch" aria-label="도매처 통합 실행">
      <div>
        <span className="inventory-eyebrow">한 번에 확인</span>
        <h2>확인할 도매처를 선택하세요</h2>
        <p>
          선택한 순서로 수집·저장합니다. 실패한 도매처가 있어도 나머지는 계속
          진행합니다.
        </p>
        <SupplierBrowserSchedule
          selected={selected}
          running={running}
          extensionReady={extensionReady}
          onRun={(providers, getKinds) => start(providers, true, getKinds)}
        />
      </div>
      <div className="supplier-batch-options">
        <label>
          <input
            type="checkbox"
            disabled={running}
            checked={selected.length === providers.length}
            onChange={(event) =>
              choose(event.target.checked ? [...providers] : [])
            }
          />
          전체 선택
        </label>
        {providers.map((provider) => (
          <label key={provider}>
            <input
              type="checkbox"
              disabled={running}
              checked={selected.includes(provider)}
              onChange={(event) =>
                choose(
                  event.target.checked
                    ? [...selected, provider]
                    : selected.filter((key) => key !== provider),
                )
              }
            />
            {supplierNames[provider]}
            <small>{provider === "dome" ? "API" : "Chrome"}</small>
          </label>
        ))}
      </div>
      <div className="supplier-batch-actions">
        <button
          type="button"
          disabled={running || !selected.length}
          onClick={() => void start()}
        >
          선택 도매처 신규·변경 확인 ({selected.length})
        </button>
        {running && (
          <button type="button" onClick={() => controller.current?.abort()}>
            통합 실행 중단
          </button>
        )}
        {!running && failed.length > 0 && (
          <button type="button" onClick={() => void start(failed)}>
            실패한 도매처만 재실행
          </button>
        )}
        <button
          type="button"
          disabled={!extensionReady || running}
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("shoppingday:supplier-vault-open"),
            )
          }
        >
          PC 로그인 보관함
        </button>
      </div>
      <p>
        직감·이불삼촌은 Chrome 확장 프로그램 0.5.19 이상과 로그인 상태 또는 잠금
        해제한 보관함이 필요합니다.
      </p>
      <div aria-live="polite">
        {providers
          .filter((key) => states[key])
          .map((key) => (
            <div
              className={`supplier-batch-result ${states[key]!.status}`}
              key={key}
            >
              <strong>
                {supplierNames[key]} ·{" "}
                {
                  {
                    waiting: "대기",
                    running: "진행 중",
                    done: "완료",
                    failed: "확인 필요",
                    stopped: "중단",
                  }[states[key]!.status]
                }
              </strong>
              <span>{states[key]!.message}</span>
            </div>
          ))}
      </div>
    </section>
  );
}
