import type { FastifyInstance } from "fastify";
import type { ScheduleRepository } from "../db/repository.js";
import { advanceClock, now } from "../util/clock.js";
import { tick, fireSchedule } from "../engine/executor.js";
import { ResourceNotFoundException } from "../util/errors.js";
import { config } from "../config.js";

const DURATION_RE = /^(\d+)(ms|s|m|h|d)$/;

function parseDuration(s: string): number {
  const match = DURATION_RE.exec(s);
  if (!match) throw new Error(`Invalid duration: ${s}`);
  const value = parseInt(match[1], 10);
  switch (match[2]) {
    case "ms": return value;
    case "s": return value * 1000;
    case "m": return value * 60_000;
    case "h": return value * 3_600_000;
    case "d": return value * 86_400_000;
    default: return 0;
  }
}

export function registerDebugRoutes(
  app: FastifyInstance,
  repo: ScheduleRepository
): void {
  // Block all debug routes in production
  app.addHook("onRequest", async (request, reply) => {
    if (config.isProduction && request.url.startsWith("/_debug")) {
      return reply.status(404).send({ error: "Not found" });
    }
  });

  // POST /_debug/tick?advance=1h — advance virtual clock and trigger evaluation
  app.post<{
    Querystring: { advance?: string };
  }>("/_debug/tick", async (request, reply) => {
    const q = request.query as Record<string, string | undefined>;

    if (q.advance) {
      const ms = parseDuration(q.advance);
      advanceClock(ms);
    }

    const firedCount = await tick(repo);

    return reply.status(200).send({
      currentTime: now().toISOString(),
      firedCount,
    });
  });

  // POST /_debug/fire/:name?groupName=... — manually fire a schedule
  app.post<{
    Params: { name: string };
    Querystring: { groupName?: string };
  }>("/_debug/fire/:name", async (request, reply) => {
    const name = request.params.name;
    const groupName =
      (request.query as Record<string, string>).groupName ?? "default";

    const schedule = repo.getSchedule(name, groupName);
    if (!schedule) {
      throw new ResourceNotFoundException(
        `Schedule ${name} does not exist in group ${groupName}.`
      );
    }

    const result = await fireSchedule(repo, schedule);

    return reply.status(200).send({
      scheduleName: name,
      groupName,
      ...result,
    });
  });

  // GET /_debug/schedules — all schedules in internal form
  app.get("/_debug/schedules", async (_request, reply) => {
    const { schedules } = repo.listSchedules(
      undefined,
      undefined,
      undefined,
      undefined,
      10000
    );

    return reply.status(200).send({
      currentTime: now().toISOString(),
      count: schedules.length,
      schedules: schedules.map((s) => ({
        ...s,
        target: JSON.parse(s.target_json),
        flexibleTimeWindow: JSON.parse(s.flexible_time_window_json),
      })),
    });
  });

  // GET /_debug/history?name=...&groupName=...&limit=...
  app.get<{
    Querystring: { name?: string; groupName?: string; limit?: string };
  }>("/_debug/history", async (request, reply) => {
    const q = request.query as Record<string, string | undefined>;
    const limit = q.limit ? parseInt(q.limit, 10) : 100;

    const history = repo.getHistory(q.name, q.groupName, limit);

    return reply.status(200).send({
      count: history.length,
      history,
    });
  });
}
