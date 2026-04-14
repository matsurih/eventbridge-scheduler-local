import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildApp, type AppContext } from "../src/app.js";

let ctx: AppContext;

beforeEach(() => {
  ctx = buildApp(":memory:");
});

afterEach(async () => {
  await ctx.app.close();
  ctx.db.close();
});

describe("Schedule Groups API", () => {
  it("GET /schedule-groups — lists default group", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/schedule-groups",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ScheduleGroups).toHaveLength(1);
    expect(body.ScheduleGroups[0].Name).toBe("default");
  });

  it("POST /schedule-groups/:Name — creates a group", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/schedule-groups/test-group",
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ScheduleGroupArn).toContain("test-group");
  });

  it("POST /schedule-groups/:Name — conflict on duplicate", async () => {
    await ctx.app.inject({
      method: "POST",
      url: "/schedule-groups/test-group",
      payload: {},
    });
    const res = await ctx.app.inject({
      method: "POST",
      url: "/schedule-groups/test-group",
      payload: {},
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().__type).toBe("ConflictException");
  });

  it("GET /schedule-groups/:Name — returns group", async () => {
    await ctx.app.inject({
      method: "POST",
      url: "/schedule-groups/test-group",
      payload: {},
    });
    const res = await ctx.app.inject({
      method: "GET",
      url: "/schedule-groups/test-group",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().Name).toBe("test-group");
  });

  it("GET /schedule-groups/:Name — 404 on not found", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/schedule-groups/nonexistent",
    });
    expect(res.statusCode).toBe(404);
  });

  it("DELETE /schedule-groups/:Name — deletes a group", async () => {
    await ctx.app.inject({
      method: "POST",
      url: "/schedule-groups/test-group",
      payload: {},
    });
    const res = await ctx.app.inject({
      method: "DELETE",
      url: "/schedule-groups/test-group",
    });
    expect(res.statusCode).toBe(200);
  });

  it("DELETE /schedule-groups/default — cannot delete default", async () => {
    const res = await ctx.app.inject({
      method: "DELETE",
      url: "/schedule-groups/default",
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("Schedules API", () => {
  const validSchedule = {
    ScheduleExpression: "rate(5 minutes)",
    Target: {
      Arn: "arn:aws:sqs:us-east-1:000000000000:my-queue",
      RoleArn: "arn:aws:iam::000000000000:role/scheduler-role",
      Input: '{"key":"value"}',
    },
    FlexibleTimeWindow: { Mode: "OFF" },
  };

  it("POST /schedules/:Name — creates a schedule", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/schedules/test-schedule",
      payload: validSchedule,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ScheduleArn).toContain("test-schedule");
  });

  it("POST /schedules/:Name — conflict on duplicate", async () => {
    await ctx.app.inject({
      method: "POST",
      url: "/schedules/test-schedule",
      payload: validSchedule,
    });
    const res = await ctx.app.inject({
      method: "POST",
      url: "/schedules/test-schedule",
      payload: validSchedule,
    });
    expect(res.statusCode).toBe(409);
  });

  it("POST /schedules/:Name — validates expression", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/schedules/test-schedule",
      payload: { ...validSchedule, ScheduleExpression: "bad()" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().__type).toBe("ValidationException");
  });

  it("GET /schedules/:Name — returns a schedule", async () => {
    await ctx.app.inject({
      method: "POST",
      url: "/schedules/test-schedule",
      payload: validSchedule,
    });
    const res = await ctx.app.inject({
      method: "GET",
      url: "/schedules/test-schedule",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.Name).toBe("test-schedule");
    expect(body.ScheduleExpression).toBe("rate(5 minutes)");
    expect(body.Target.Arn).toBe("arn:aws:sqs:us-east-1:000000000000:my-queue");
  });

  it("GET /schedules/:Name — 404 on not found", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/schedules/nonexistent",
    });
    expect(res.statusCode).toBe(404);
  });

  it("PUT /schedules/:Name — updates a schedule", async () => {
    await ctx.app.inject({
      method: "POST",
      url: "/schedules/test-schedule",
      payload: validSchedule,
    });
    const res = await ctx.app.inject({
      method: "PUT",
      url: "/schedules/test-schedule",
      payload: {
        ScheduleExpression: "rate(10 minutes)",
        State: "DISABLED",
      },
    });
    expect(res.statusCode).toBe(200);

    const getRes = await ctx.app.inject({
      method: "GET",
      url: "/schedules/test-schedule",
    });
    expect(getRes.json().ScheduleExpression).toBe("rate(10 minutes)");
    expect(getRes.json().State).toBe("DISABLED");
  });

  it("PUT /schedules/:Name — 404 on not found", async () => {
    const res = await ctx.app.inject({
      method: "PUT",
      url: "/schedules/nonexistent",
      payload: { ScheduleExpression: "rate(5 minutes)" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("DELETE /schedules/:Name — deletes a schedule", async () => {
    await ctx.app.inject({
      method: "POST",
      url: "/schedules/test-schedule",
      payload: validSchedule,
    });
    const res = await ctx.app.inject({
      method: "DELETE",
      url: "/schedules/test-schedule",
    });
    expect(res.statusCode).toBe(200);

    const getRes = await ctx.app.inject({
      method: "GET",
      url: "/schedules/test-schedule",
    });
    expect(getRes.statusCode).toBe(404);
  });

  it("DELETE /schedules/:Name — 404 on not found", async () => {
    const res = await ctx.app.inject({
      method: "DELETE",
      url: "/schedules/nonexistent",
    });
    expect(res.statusCode).toBe(404);
  });

  it("GET /schedules — lists schedules", async () => {
    await ctx.app.inject({
      method: "POST",
      url: "/schedules/sched-1",
      payload: validSchedule,
    });
    await ctx.app.inject({
      method: "POST",
      url: "/schedules/sched-2",
      payload: validSchedule,
    });

    const res = await ctx.app.inject({
      method: "GET",
      url: "/schedules",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().Schedules).toHaveLength(2);
  });

  it("GET /schedules — filters by state", async () => {
    await ctx.app.inject({
      method: "POST",
      url: "/schedules/enabled-sched",
      payload: validSchedule,
    });
    await ctx.app.inject({
      method: "POST",
      url: "/schedules/disabled-sched",
      payload: { ...validSchedule, State: "DISABLED" },
    });

    const res = await ctx.app.inject({
      method: "GET",
      url: "/schedules?State=ENABLED",
    });
    expect(res.json().Schedules).toHaveLength(1);
    expect(res.json().Schedules[0].Name).toBe("enabled-sched");
  });

  it("supports custom groups", async () => {
    await ctx.app.inject({
      method: "POST",
      url: "/schedule-groups/custom",
      payload: {},
    });
    const res = await ctx.app.inject({
      method: "POST",
      url: "/schedules/sched-in-custom",
      payload: { ...validSchedule, GroupName: "custom" },
    });
    expect(res.statusCode).toBe(200);

    const getRes = await ctx.app.inject({
      method: "GET",
      url: "/schedules/sched-in-custom?groupName=custom",
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().GroupName).toBe("custom");
  });

  it("rejects schedule in non-existent group", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/schedules/sched-bad-group",
      payload: { ...validSchedule, GroupName: "nonexistent" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("supports cron expressions", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/schedules/cron-sched",
      payload: {
        ...validSchedule,
        ScheduleExpression: "cron(0 12 * * ? *)",
      },
    });
    expect(res.statusCode).toBe(200);
  });

  it("supports at expressions", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/schedules/at-sched",
      payload: {
        ...validSchedule,
        ScheduleExpression: "at(2025-06-01T12:00:00)",
      },
    });
    expect(res.statusCode).toBe(200);
  });

  it("accepts application/x-amz-json-1.0 content type", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/schedules/amz-json-sched",
      headers: {
        "content-type": "application/x-amz-json-1.0",
      },
      payload: JSON.stringify(validSchedule),
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("Pagination", () => {
  const validSchedule = {
    ScheduleExpression: "rate(5 minutes)",
    Target: {
      Arn: "arn:aws:sqs:us-east-1:000000000000:my-queue",
    },
    FlexibleTimeWindow: { Mode: "OFF" },
  };

  it("paginates schedules", async () => {
    for (let i = 0; i < 5; i++) {
      await ctx.app.inject({
        method: "POST",
        url: `/schedules/sched-${i}`,
        payload: validSchedule,
      });
    }

    const res1 = await ctx.app.inject({
      method: "GET",
      url: "/schedules?MaxResults=2",
    });
    expect(res1.json().Schedules).toHaveLength(2);
    expect(res1.json().NextToken).toBeDefined();

    const res2 = await ctx.app.inject({
      method: "GET",
      url: `/schedules?MaxResults=2&NextToken=${res1.json().NextToken}`,
    });
    expect(res2.json().Schedules).toHaveLength(2);
  });
});

describe("Health check", () => {
  it("returns ok", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/health",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});
