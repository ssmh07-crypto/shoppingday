"use client";

import { useEffect, useState } from "react";

type Schedule = {
  enabled: boolean;
  applyPrices: boolean;
  intervalHours: number;
  nextRunAt: string | null;
};
const initial: Schedule = {
  enabled: false,
  applyPrices: false,
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
        공급처 원본의 변경을 정기적으로 가져옵니다. 아래 옵션을 켜면 재계산한 판매가도 스마트스토어에 반영합니다. 네이버 릴레이가 실행 중이어야 합니다.
      </p>
      <fieldset disabled={loading || saving || !loaded}>
        <label><input type="checkbox" checked={schedule.applyPrices ?? false} onChange={(event) => setSchedule({ ...schedule, applyPrices: event.target.checked })} />재계산한 판매가도 자동 반영</label>
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
