export function parseDatabaseTimestamp(value: unknown): Date | null {
  if (value === null || value === undefined) return null;

  const parsed =
    value instanceof Date
      ? value
      : typeof value === "string"
        ? new Date(value)
        : null;

  if (!parsed || Number.isNaN(parsed.getTime())) {
    throw new Error("유효하지 않은 데이터베이스 시간 값입니다.");
  }

  return parsed;
}
