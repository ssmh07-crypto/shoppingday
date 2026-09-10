"use client";
import { useEffect, useRef, useState } from "react";
import type { BatchSupplier } from "./supplier-batch-runner";
import type { SupplierChangeKind } from "@/modules/suppliers/core/change-application-policy";
type Schedule = {
  providers: BatchSupplier[];
  hours: number;
  nextAt: number;
  kinds?: SupplierChangeKind[];
};
const key = "shoppingday:browser-supplier-schedule";
function readSchedule(): Schedule | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    if (
      !value ||
      ![6, 12, 24].includes(value.hours) ||
      !Number.isFinite(value.nextAt) ||
      !Array.isArray(value.providers) ||
      !value.providers.length ||
      value.providers.some(
        (p: unknown) => p !== "zicgam" && p !== "ebulsamchon",
      )
    )
      return null;
    return { ...value, kinds: Array.isArray(value.kinds) ? value.kinds.filter((kind: unknown) => kind === "sold_out" || kind === "discontinued" || kind === "description") : [] };
  } catch {
    return null;
  }
}
export function SupplierBrowserSchedule({
  selected,
  running,
  extensionReady,
  onRun,
}: {
  selected: BatchSupplier[];
  running: boolean;
  extensionReady: boolean;
  onRun: (
    providers: BatchSupplier[],
    getKinds?: () => SupplierChangeKind[],
  ) => Promise<void>;
}) {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [hours, setHours] = useState(24);
  const [kinds, setKinds] = useState<SupplierChangeKind[]>([]);
  const [message, setMessage] = useState("");
  const callback = useRef(onRun);
  useEffect(() => {
    callback.current = onRun;
  }, [onRun]);
  useEffect(() => {
    const refresh = () => {
      const saved = readSchedule();
      setSchedule(saved);
      if (saved) { setHours(saved.hours); setKinds(saved.kinds ?? []); }
    };
    const initial = window.setTimeout(refresh, 0);
    window.addEventListener("storage", refresh);
    const interval = window.setInterval(() => {
      if (running || !extensionReady || !navigator.locks) return;
      void navigator.locks
        .request(key, { ifAvailable: true }, async (lock) => {
          if (!lock) return;
          const current = readSchedule();
          if (!current || current.nextAt > Date.now()) return;
          const next = {
            ...current,
            nextAt: Date.now() + current.hours * 3600000,
          };
          localStorage.setItem(key, JSON.stringify(next));
          setSchedule(next);
          setMessage(
            "예약된 도매처 확인을 시작했습니다. 결과는 통합 실행 영역에서 확인하세요.",
          );
          const allowed = (current.kinds ?? []).filter((kind) =>
            ["sold_out", "discontinued", "description"].includes(kind),
          );
          if (allowed.length)
            await callback.current(current.providers, () => {
              const saved = readSchedule();
              if (!saved || saved.nextAt !== next.nextAt) return [];
              return allowed.filter((kind) => saved.kinds?.includes(kind));
            });
          else await callback.current(current.providers);
        })
        .catch(() =>
          setMessage(
            "예약 실행을 시작하지 못했습니다. 저장소·로그인 상태를 확인하세요.",
          ),
        );
    }, 60000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
      window.removeEventListener("storage", refresh);
    };
  }, [running, extensionReady]);
  function save() {
    const providers = selected.filter((p) => p !== "dome");
    if (!providers.length || !extensionReady || !navigator.locks) {
      setMessage(
        "직감 또는 이불삼촌을 선택하고 최신 Chrome 확장 프로그램을 연결하세요.",
      );
      return;
    }
    if (
      !confirm(
        `${providers.length}개 도매처를 ${hours}시간마다 이 화면에서 자동 확인할까요? Chrome과 이 화면을 열어 두고 로그인을 유지해야 합니다.${kinds.length ? " 선택한 품절·단종·상세 항목은 연결된 스마트스토어에 자동 반영합니다." : ""}`,
      )
    )
      return;
    try {
      const next = {
        providers,
        hours,
        kinds,
        nextAt: Date.now() + hours * 3600000,
      };
      localStorage.setItem(key, JSON.stringify(next));
      setSchedule(next);
      setMessage("Chrome 도매처 예약을 저장했습니다.");
    } catch {
      setMessage("브라우저에 예약을 저장하지 못했습니다.");
    }
  }
  return (
    <details className="supplier-import-more">
      <summary>
        Chrome 도매처 확인 예약{schedule ? " · 사용 중" : " · 꺼짐"}
      </summary>
      <p>
        직감·이불삼촌만 대상입니다. Chrome과 이 화면을 열어 두어야 하며
        잠자기·종료·탭 제한 시 다음 접속 이후로 지연됩니다. 잠금 해제 또는 수동
        로그인이 필요합니다. 친구도매는 아래 서버 예약을 이용하세요.
      </p>
      <fieldset disabled={running}>
        <legend>수집 후 스마트스토어 자동 반영 · 기본 꺼짐</legend>
        {(
          [
            ["sold_out", "확인된 품절"],
            ["discontinued", "명시된 단종 → 판매 중지"],
            ["description", "편집하지 않은 상세페이지"],
          ] as const
        ).map(([kind, label]) => (
          <label key={kind}>
            <input
              type="checkbox"
              checked={kinds.includes(kind)}
              onChange={(event) =>
                setKinds(
                  event.target.checked
                    ? [...kinds, kind]
                    : kinds.filter((value) => value !== kind),
                )
              }
            />
            {label}
          </label>
        ))}
        <select
          aria-label="Chrome 도매처 예약 주기"
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
        >
          <option value={6}>6시간</option>
          <option value={12}>12시간</option>
          <option value={24}>24시간</option>
        </select>
        <button type="button" onClick={save}>
          선택한 Chrome 도매처로 예약 저장
        </button>
      </fieldset>
      {schedule && (
        <>
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.removeItem(key);
                setSchedule(null);
                setMessage(
                  "예약을 해제했습니다. 현재 요청 후 자동 반영을 중단합니다.",
                );
              } catch {
                setMessage("예약 해제 실패: 브라우저 저장소를 확인하세요.");
              }
            }}
          >
            예약 해제
          </button>
          <p>
            예약:{" "}
            {schedule.providers
              .map((p) => (p === "zicgam" ? "직감" : "이불삼촌"))
              .join(", ")}{" "}
            · {schedule.hours}시간 · 다음 확인{" "}
            {new Date(schedule.nextAt).toLocaleString("ko-KR")} · 자동 반영{" "}
            {(schedule.kinds ?? [])
              .map(
                (kind) =>
                  ({
                    sold_out: "품절",
                    discontinued: "단종",
                    description: "상세",
                  })[kind],
              )
              .join(", ") || "없음"}
          </p>
        </>
      )}
      <p role="status">{message}</p>
    </details>
  );
}
