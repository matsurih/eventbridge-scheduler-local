import { CronExpressionParser } from "cron-parser";
import { DateTime } from "luxon";
import { ValidationException } from "./errors.js";

export type ExpressionType = "rate" | "cron" | "at";

export interface ParsedExpression {
  type: ExpressionType;
  raw: string;
}

const RATE_RE = /^rate\((\d+)\s+(minutes?|hours?|days?)\)$/;
const CRON_RE = /^cron\((.+)\)$/;
const AT_RE = /^at\((\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\)$/;

export function parseScheduleExpression(expr: string): ParsedExpression {
  if (RATE_RE.test(expr)) return { type: "rate", raw: expr };
  if (CRON_RE.test(expr)) return { type: "cron", raw: expr };
  if (AT_RE.test(expr)) return { type: "at", raw: expr };
  throw new ValidationException(`Invalid schedule expression: ${expr}`);
}

/**
 * Check if a schedule should fire given current time and last run.
 * Returns true if the schedule should fire now.
 */
export function shouldFire(
  expression: string,
  timezone: string,
  lastRun: Date | null,
  currentTime: Date
): boolean {
  const parsed = parseScheduleExpression(expression);

  switch (parsed.type) {
    case "rate":
      return shouldFireRate(expression, lastRun, currentTime);
    case "cron":
      return shouldFireCron(expression, timezone, lastRun, currentTime);
    case "at":
      return shouldFireAt(expression, timezone, lastRun, currentTime);
  }
}

function shouldFireRate(expression: string, lastRun: Date | null, currentTime: Date): boolean {
  const match = RATE_RE.exec(expression);
  if (!match) return false;

  const value = parseInt(match[1], 10);
  const unit = match[2].replace(/s$/, ""); // normalize plural

  let intervalMs: number;
  switch (unit) {
    case "minute":
      intervalMs = value * 60_000;
      break;
    case "hour":
      intervalMs = value * 3_600_000;
      break;
    case "day":
      intervalMs = value * 86_400_000;
      break;
    default:
      return false;
  }

  if (!lastRun) return true; // never run → fire immediately
  return currentTime.getTime() - lastRun.getTime() >= intervalMs;
}

function shouldFireCron(
  expression: string,
  timezone: string,
  lastRun: Date | null,
  currentTime: Date
): boolean {
  const match = CRON_RE.exec(expression);
  if (!match) return false;

  const fields = match[1].trim().split(/\s+/);
  if (fields.length !== 6) {
    throw new ValidationException(
      `Cron expression must have 6 fields (min hour dom month dow year), got ${fields.length}`
    );
  }

  // Check for unsupported L / # patterns
  const raw = fields.join(" ");
  if (/[L#]/.test(raw)) {
    throw new ValidationException("L and # cron extensions are not currently supported");
  }

  // Drop the year field (6th), normalize ? to *
  const fiveFields = fields
    .slice(0, 5)
    .map((f) => f.replace(/\?/g, "*"))
    .join(" ");

  const tz = timezone || "UTC";

  try {
    // Get the previous occurrence relative to currentTime
    const interval = CronExpressionParser.parse(fiveFields, {
      currentDate: currentTime,
      tz,
    });

    const prev = interval.prev().toDate();

    // If there's no last run, fire if the prev occurrence is very recent (within 60s)
    if (!lastRun) {
      return currentTime.getTime() - prev.getTime() < 60_000;
    }

    // Fire if there's a cron tick between lastRun and currentTime
    return prev.getTime() > lastRun.getTime();
  } catch {
    throw new ValidationException(`Invalid cron expression: ${fiveFields}`);
  }
}

function shouldFireAt(
  expression: string,
  timezone: string,
  lastRun: Date | null,
  currentTime: Date
): boolean {
  if (lastRun) return false; // already fired

  const match = AT_RE.exec(expression);
  if (!match) return false;

  const tz = timezone || "UTC";
  const dt = DateTime.fromISO(match[1], { zone: tz });
  if (!dt.isValid) {
    throw new ValidationException(`Invalid at() datetime: ${match[1]}`);
  }

  return currentTime.getTime() >= dt.toMillis();
}

/**
 * Compute the next fire time for a given expression.
 * Used for informational purposes.
 */
export function nextFireTime(expression: string, timezone: string, currentTime: Date): Date | null {
  const parsed = parseScheduleExpression(expression);

  switch (parsed.type) {
    case "rate": {
      const match = RATE_RE.exec(expression)!;
      const value = parseInt(match[1], 10);
      const unit = match[2].replace(/s$/, "");
      let ms: number;
      switch (unit) {
        case "minute":
          ms = value * 60_000;
          break;
        case "hour":
          ms = value * 3_600_000;
          break;
        case "day":
          ms = value * 86_400_000;
          break;
        default:
          return null;
      }
      return new Date(currentTime.getTime() + ms);
    }
    case "cron": {
      const match = CRON_RE.exec(expression);
      if (!match) return null;
      const fields = match[1].trim().split(/\s+/);
      const fiveFields = fields
        .slice(0, 5)
        .map((f) => f.replace(/\?/g, "*"))
        .join(" ");
      try {
        const interval = CronExpressionParser.parse(fiveFields, {
          currentDate: currentTime,
          tz: timezone || "UTC",
        });
        return interval.next().toDate();
      } catch {
        return null;
      }
    }
    case "at": {
      const match = AT_RE.exec(expression);
      if (!match) return null;
      const dt = DateTime.fromISO(match[1], { zone: timezone || "UTC" });
      return dt.isValid && dt.toMillis() > currentTime.getTime() ? dt.toJSDate() : null;
    }
  }
}
