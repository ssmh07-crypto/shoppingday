"use client";

import { useEffect, useState } from "react";

type Schedule = {
  enabled: boolean;
  applyPrices: boolean;
  applySoldOut: boolean;
  applyDiscontinued: boolean;
  applyDescriptions: boolean;
  intervalHours: number;
  nextRunAt: string | null;
};
const initial: Schedule = {
  enabled: false,
  applyPrices: false,
  applySoldOut: false,
  applyDiscontinued: false,
  applyDescriptions: false,
  intervalHours: 24,
  nextRunAt: null,
};

export function SupplierSyncSchedule() {
  const [schedule, setSchedule] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/suppliers/dome/products/schedule", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            "예약 설정을 확인하지 못했습니다. 새로고침해 주세요.",
          );
        return response.json();
      })
      .then((body) => {
        setSchedule(body.schedule ?? initial);
        setLoaded(true);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setMessage(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/suppliers/dome/products/schedule", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabled: schedule.enabled,
          applyPrices: schedule.applyPrices,
          applySoldOut: schedule.applySoldOut,
          applyDiscontinued: schedule.applyDiscontinued,
          applyDescriptions: schedule.applyDescriptions,
          intervalHours: schedule.intervalHours,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.message ?? "예약을 저장하지 못했습니다.");
      setSchedule(body.schedule);
      setMessage(
        body.schedule.enabled
          ? "변경 확인 예약을 저장했습니다."
          : "예약을 해제했습니다.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "연결을 확인해 주세요.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="supplier-schedule" aria-label="친구도매 변경 확인 예약">
      <h3>변경 확인 예약</h3>
      <p>
        공급처 원본의 변경을 정기적으로 가져옵니다. 선택한 판매가·공급 상태·상세
        변경도 스마트스토어에 반영합니다. 네이버 릴레이가 실행 중이어야 합니다.
      </p>
      <fieldset disabled={loading || saving || !loaded}>
        <label>
          <input
            type="checkbox"
            checked={schedule.applyPrices ?? false}
            onChange={(event) =>
              setSchedule({ ...schedule, applyPrices: event.target.checked })
            }
          />
          재계산한 판매가도 자동 반영
        </label>
        <label>
          <input
            type="checkbox"
            checked={schedule.applySoldOut ?? false}
            onChange={(event) =>
              setSchedule({ ...schedule, applySoldOut: event.target.checked })
            }
          />
          확인된 품절 자동 반영
        </label>
        <label>
          <input
            type="checkbox"
            checked={schedule.applyDiscontinued ?? false}
            onChange={(event) =>
              setSchedule({
                ...schedule,
                applyDiscontinued: event.target.checked,
              })
            }
          />
          명시된 단종을 판매 중지로 자동 반영
        </label>
        <label>
          <input
            type="checkbox"
            checked={schedule.applyDescriptions ?? false}
            onChange={(event) =>
              setSchedule({
                ...schedule,
                applyDescriptions: event.target.checked,
              })
            }
          />
          편집하지 않은 공급처 상세페이지 자동 반영
        </label>
        <p>
          선택한 항목만 등록된 스토어에 반영합니다. 조회 실패는 품절·단종으로
          처리하지 않습니다. 판매자가 편집한 상세페이지는 유지하며 판매 재개는
          직접 검토합니다.
        </p>
        <label>
          <input
            type="checkbox"
            checked={schedule.enabled}
            onChange={(event) =>
              setSchedule({ ...schedule, enabled: event.target.checked })
            }
          />{" "}
          예약 사용
        </label>
        <select
          aria-label="변경 확인 주기"
          value={schedule.intervalHours}
          onChange={(event) =>
            setSchedule({
              ...schedule,
              intervalHours: Number(event.target.value),
            })
          }
        >
          <option value={6}>6시간마다</option>
          <option value={12}>12시간마다</option>
          <option value={24}>하루 한 번</option>
        </select>
        <button type="button" onClick={() => void save()}>
          {saving ? "저장 중…" : "예약 저장"}
        </button>
      </fieldset>
      {schedule.enabled && schedule.nextRunAt && (
        <small>
          다음 확인:{" "}
          {new Date(schedule.nextRunAt).toLocaleString("ko-KR", {
            timeZone: "Asia/Seoul",
          })}{" "}
          이후 · 예약 실행 지연 가능
        </small>
      )}
      <span role="status">{message}</span>
    </section>
  );
}
