import type { ScheduleRepository } from "../db/repository.js";
import type { Target, ScheduleRow } from "../types.js";
import { shouldFire } from "../util/expression.js";
import { now } from "../util/clock.js";
import { dispatchTarget } from "../dispatch/dispatcher.js";

let tickTimer: ReturnType<typeof setInterval> | null = null;

export function startEngine(repo: ScheduleRepository): void {
  if (tickTimer) return;
  console.log("[engine] Starting execution engine (1s tick)");
  tickTimer = setInterval(() => tick(repo), 1000);
}

export function stopEngine(): void {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
    console.log("[engine] Execution engine stopped");
  }
}

/**
 * Single tick: evaluate all ENABLED schedules and fire those that are due.
 * Can also be called manually for debug/test purposes.
 */
export async function tick(repo: ScheduleRepository): Promise<number> {
  const currentTime = now();
  const schedules = repo.getEnabledSchedules();
  let firedCount = 0;

  for (const schedule of schedules) {
    try {
      const lastRun = schedule.last_run ? new Date(schedule.last_run) : null;

      // Check start/end date windows
      if (schedule.start_date && currentTime < new Date(schedule.start_date)) {
        continue;
      }
      if (schedule.end_date && currentTime > new Date(schedule.end_date)) {
        continue;
      }

      const shouldFireNow = shouldFire(
        schedule.schedule_expression,
        schedule.schedule_expression_timezone,
        lastRun,
        currentTime
      );

      if (shouldFireNow) {
        await fireSchedule(repo, schedule, currentTime);
        firedCount++;
      }
    } catch (err) {
      console.error(`[engine] Error evaluating schedule ${schedule.name}:`, err);
    }
  }

  return firedCount;
}

/**
 * Fire a single schedule: update last_run in a transaction, then dispatch.
 */
export async function fireSchedule(
  repo: ScheduleRepository,
  schedule: ScheduleRow,
  fireTime?: Date
): Promise<{ success: boolean; error?: string }> {
  const firedAt = (fireTime ?? now()).toISOString();
  const target: Target = JSON.parse(schedule.target_json);

  // Atomically update last_run to prevent double-fire
  repo.transaction(() => {
    repo.updateLastRun(schedule.name, schedule.group_name, firedAt);
  });

  const ctx = {
    scheduleName: schedule.name,
    groupName: schedule.group_name,
    firedAt,
  };

  console.log(
    `[engine] Firing schedule ${schedule.name} (group: ${schedule.group_name}) at ${firedAt}`
  );

  const result = await dispatchTarget(target, ctx);

  // Record in history
  repo.recordExecution({
    schedule_name: schedule.name,
    group_name: schedule.group_name,
    fired_at: firedAt,
    target_arn: target.Arn,
    status: result.success ? "SUCCESS" : "FAILED",
    error_message: result.error ?? null,
  });

  // Handle at() one-shot: disable after firing
  if (schedule.schedule_expression.startsWith("at(")) {
    if (schedule.action_after_completion === "DELETE") {
      repo.deleteSchedule(schedule.name, schedule.group_name);
      console.log(
        `[engine] Deleted one-shot schedule ${schedule.name} (ActionAfterCompletion=DELETE)`
      );
    } else {
      repo.disableSchedule(schedule.name, schedule.group_name);
      console.log(`[engine] Disabled one-shot schedule ${schedule.name} after firing`);
    }
  }

  return result;
}
