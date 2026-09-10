import { z } from "zod";

export const syncScheduleInputSchema = z.object({
  enabled: z.boolean(),
  applyPrices: z.boolean().default(false),
  applySoldOut: z.boolean().default(false),
  applyDiscontinued: z.boolean().default(false),
  applyDescriptions: z.boolean().default(false),
  intervalHours: z.union([z.literal(6), z.literal(12), z.literal(24)]),
});
export type SyncScheduleInput = z.input<typeof syncScheduleInputSchema>;

export function nextSyncRun(now: Date, input: SyncScheduleInput): Date | null {
  const schedule = syncScheduleInputSchema.parse(input);
  return schedule.enabled
    ? new Date(now.getTime() + schedule.intervalHours * 3_600_000)
    : null;
}
