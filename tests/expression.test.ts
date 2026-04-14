import { describe, it, expect } from "vitest";
import { parseScheduleExpression, shouldFire, nextFireTime } from "../src/util/expression.js";

describe("parseScheduleExpression", () => {
  it("parses rate expressions", () => {
    expect(parseScheduleExpression("rate(5 minutes)")).toEqual({
      type: "rate",
      raw: "rate(5 minutes)",
    });
    expect(parseScheduleExpression("rate(1 hour)")).toEqual({
      type: "rate",
      raw: "rate(1 hour)",
    });
    expect(parseScheduleExpression("rate(1 day)")).toEqual({
      type: "rate",
      raw: "rate(1 day)",
    });
  });

  it("parses cron expressions", () => {
    expect(parseScheduleExpression("cron(0 12 * * ? *)")).toEqual({
      type: "cron",
      raw: "cron(0 12 * * ? *)",
    });
  });

  it("parses at expressions", () => {
    expect(parseScheduleExpression("at(2025-01-01T00:00:00)")).toEqual({
      type: "at",
      raw: "at(2025-01-01T00:00:00)",
    });
  });

  it("throws on invalid expressions", () => {
    expect(() => parseScheduleExpression("invalid")).toThrow("Invalid schedule expression");
  });
});

describe("shouldFire — rate", () => {
  it("fires immediately if never run", () => {
    expect(shouldFire("rate(5 minutes)", "UTC", null, new Date("2025-01-01T00:00:00Z"))).toBe(true);
  });

  it("fires when interval elapsed", () => {
    const lastRun = new Date("2025-01-01T00:00:00Z");
    const now = new Date("2025-01-01T00:05:00Z");
    expect(shouldFire("rate(5 minutes)", "UTC", lastRun, now)).toBe(true);
  });

  it("does not fire before interval", () => {
    const lastRun = new Date("2025-01-01T00:00:00Z");
    const now = new Date("2025-01-01T00:04:00Z");
    expect(shouldFire("rate(5 minutes)", "UTC", lastRun, now)).toBe(false);
  });

  it("handles hours", () => {
    const lastRun = new Date("2025-01-01T00:00:00Z");
    const now = new Date("2025-01-01T01:00:00Z");
    expect(shouldFire("rate(1 hour)", "UTC", lastRun, now)).toBe(true);
  });

  it("handles days", () => {
    const lastRun = new Date("2025-01-01T00:00:00Z");
    const now = new Date("2025-01-02T00:00:00Z");
    expect(shouldFire("rate(1 day)", "UTC", lastRun, now)).toBe(true);
  });
});

describe("shouldFire — cron", () => {
  it("fires when cron matches since last run", () => {
    // cron every hour at minute 0
    const lastRun = new Date("2025-01-01T00:30:00Z");
    const now = new Date("2025-01-01T01:00:01Z");
    expect(shouldFire("cron(0 * * * ? *)", "UTC", lastRun, now)).toBe(true);
  });

  it("does not fire when no tick since last run", () => {
    const lastRun = new Date("2025-01-01T01:00:00Z");
    const now = new Date("2025-01-01T01:30:00Z");
    expect(shouldFire("cron(0 * * * ? *)", "UTC", lastRun, now)).toBe(false);
  });

  it("throws on L/# extensions", () => {
    expect(() => shouldFire("cron(0 12 L * ? *)", "UTC", null, new Date())).toThrow(
      "L and # cron extensions are not currently supported"
    );
  });

  it("normalizes ? to *", () => {
    const lastRun = new Date("2025-01-01T11:00:00Z");
    const now = new Date("2025-01-01T12:00:01Z");
    expect(shouldFire("cron(0 12 ? * ? *)", "UTC", lastRun, now)).toBe(true);
  });
});

describe("shouldFire — at", () => {
  it("fires when time has passed", () => {
    expect(
      shouldFire("at(2025-01-01T12:00:00)", "UTC", null, new Date("2025-01-01T12:00:01Z"))
    ).toBe(true);
  });

  it("does not fire before the target time", () => {
    expect(
      shouldFire("at(2025-01-01T12:00:00)", "UTC", null, new Date("2025-01-01T11:59:59Z"))
    ).toBe(false);
  });

  it("does not fire if already run", () => {
    expect(
      shouldFire(
        "at(2025-01-01T12:00:00)",
        "UTC",
        new Date("2025-01-01T12:00:00Z"),
        new Date("2025-01-01T12:01:00Z")
      )
    ).toBe(false);
  });

  it("respects timezone", () => {
    // at(2025-01-01T12:00:00) in Asia/Tokyo is 03:00 UTC
    expect(
      shouldFire("at(2025-01-01T12:00:00)", "Asia/Tokyo", null, new Date("2025-01-01T03:00:01Z"))
    ).toBe(true);
    expect(
      shouldFire("at(2025-01-01T12:00:00)", "Asia/Tokyo", null, new Date("2025-01-01T02:59:59Z"))
    ).toBe(false);
  });
});

describe("nextFireTime", () => {
  it("returns next time for rate", () => {
    const now = new Date("2025-01-01T00:00:00Z");
    const next = nextFireTime("rate(5 minutes)", "UTC", now);
    expect(next).toEqual(new Date("2025-01-01T00:05:00Z"));
  });

  it("returns next time for cron", () => {
    const now = new Date("2025-01-01T00:30:00Z");
    const next = nextFireTime("cron(0 * * * ? *)", "UTC", now);
    expect(next).toEqual(new Date("2025-01-01T01:00:00Z"));
  });

  it("returns null for past at()", () => {
    const now = new Date("2025-01-02T00:00:00Z");
    const next = nextFireTime("at(2025-01-01T12:00:00)", "UTC", now);
    expect(next).toBeNull();
  });

  it("returns fire time for future at()", () => {
    const now = new Date("2025-01-01T00:00:00Z");
    const next = nextFireTime("at(2025-01-01T12:00:00)", "UTC", now);
    expect(next).toEqual(new Date("2025-01-01T12:00:00Z"));
  });
});
