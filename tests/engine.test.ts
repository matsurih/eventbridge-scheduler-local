import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildApp, type AppContext } from "../src/app.js";
import { tick, fireSchedule } from "../src/engine/executor.js";
import { advanceClock, resetClock } from "../src/util/clock.js";

let ctx: AppContext;

beforeEach(() => {
  ctx = buildApp(":memory:");
  resetClock();
});

afterEach(async () => {
  await ctx.app.close();
  ctx.db.close();
  resetClock();
});

const createSchedule = async (
  name: string,
  expression: string,
  state = "ENABLED"
) => {
  await ctx.app.inject({
    method: "POST",
    url: `/schedules/${name}`,
    payload: {
      ScheduleExpression: expression,
      Target: {
        // Use an ARN that hits the fallback handler (log-only, always succeeds)
        Arn: "arn:aws:ecs:us-east-1:000000000000:task/test-task",
        Input: '{"test":true}',
      },
      FlexibleTimeWindow: { Mode: "OFF" },
      State: state,
    },
  });
};

describe("Execution Engine", () => {
  it("fires a rate schedule that has never run", async () => {
    await createSchedule("rate-test", "rate(5 minutes)");

    const firedCount = await tick(ctx.repo);
    expect(firedCount).toBe(1);

    // Check history
    const history = ctx.repo.getHistory("rate-test");
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe("SUCCESS");
  });

  it("does not double-fire", async () => {
    await createSchedule("rate-test", "rate(5 minutes)");

    await tick(ctx.repo);
    const firedCount = await tick(ctx.repo);
    expect(firedCount).toBe(0);
  });

  it("fires again after interval elapses", async () => {
    await createSchedule("rate-test", "rate(5 minutes)");

    await tick(ctx.repo);
    advanceClock(5 * 60 * 1000);
    const firedCount = await tick(ctx.repo);
    expect(firedCount).toBe(1);

    const history = ctx.repo.getHistory("rate-test");
    expect(history).toHaveLength(2);
  });

  it("skips disabled schedules", async () => {
    await createSchedule("disabled-test", "rate(1 minute)", "DISABLED");

    const firedCount = await tick(ctx.repo);
    expect(firedCount).toBe(0);
  });

  it("disables at() schedule after firing", async () => {
    await createSchedule("at-test", "at(2020-01-01T00:00:00)");

    const firedCount = await tick(ctx.repo);
    expect(firedCount).toBe(1);

    const schedule = ctx.repo.getSchedule("at-test", "default");
    expect(schedule?.state).toBe("DISABLED");
  });

  it("manual fireSchedule works", async () => {
    await createSchedule("manual-fire", "rate(1 hour)");

    // Manually fire the schedule
    const schedule = ctx.repo.getSchedule("manual-fire", "default")!;
    const result = await fireSchedule(ctx.repo, schedule);
    expect(result.success).toBe(true);

    const history = ctx.repo.getHistory("manual-fire");
    expect(history).toHaveLength(1);
  });
});

describe("Debug Endpoints", () => {
  it("POST /_debug/tick — triggers evaluation", async () => {
    await createSchedule("debug-rate", "rate(5 minutes)");

    const res = await ctx.app.inject({
      method: "POST",
      url: "/_debug/tick",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().firedCount).toBe(1);
  });

  it("POST /_debug/tick?advance=1h — advances clock", async () => {
    await createSchedule("debug-rate", "rate(5 minutes)");

    // First tick fires immediately
    await ctx.app.inject({ method: "POST", url: "/_debug/tick" });

    // Second tick within 5 min should not fire
    const res1 = await ctx.app.inject({ method: "POST", url: "/_debug/tick" });
    expect(res1.json().firedCount).toBe(0);

    // Advance 1 hour and tick
    const res2 = await ctx.app.inject({
      method: "POST",
      url: "/_debug/tick?advance=1h",
    });
    expect(res2.json().firedCount).toBe(1);
  });

  it("POST /_debug/fire/:name — manually fires", async () => {
    await createSchedule("manual-debug", "rate(1 hour)");

    const res = await ctx.app.inject({
      method: "POST",
      url: "/_debug/fire/manual-debug",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it("POST /_debug/fire/:name — 404 for unknown", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/_debug/fire/nonexistent",
    });
    expect(res.statusCode).toBe(404);
  });

  it("GET /_debug/schedules — lists all", async () => {
    await createSchedule("debug-list-1", "rate(5 minutes)");
    await createSchedule("debug-list-2", "rate(10 minutes)");

    const res = await ctx.app.inject({
      method: "GET",
      url: "/_debug/schedules",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().count).toBe(2);
  });

  it("GET /_debug/history — returns history", async () => {
    await createSchedule("hist-test", "rate(5 minutes)");
    await ctx.app.inject({ method: "POST", url: "/_debug/tick" });

    const res = await ctx.app.inject({
      method: "GET",
      url: "/_debug/history?name=hist-test",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().count).toBe(1);
    expect(res.json().history[0].schedule_name).toBe("hist-test");
  });
});
