import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { initDb } from "./db/schema.js";
import { ScheduleRepository } from "./db/repository.js";
import { registerScheduleRoutes } from "./routes/schedules.js";
import { registerScheduleGroupRoutes } from "./routes/schedule-groups.js";
import { registerDebugRoutes } from "./routes/debug.js";
import { registerAllHandlers } from "./dispatch/handlers.js";
import { SchedulerError } from "./util/errors.js";

export interface AppContext {
  app: FastifyInstance;
  db: Database.Database;
  repo: ScheduleRepository;
}

export function buildApp(dbPath: string): AppContext {
  const db = initDb(dbPath);
  const repo = new ScheduleRepository(db);

  const app = Fastify({
    logger: true,
  });

  // AWS SDK sends JSON with Content-Type: application/x-amz-json-1.0
  app.addContentTypeParser(
    "application/x-amz-json-1.0",
    { parseAs: "string" },
    (_req, body, done) => {
      try {
        done(null, JSON.parse(body as string));
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  // Error handler for SchedulerError
  app.setErrorHandler((error: Error, _request, reply) => {
    if (error instanceof SchedulerError) {
      return reply.status(error.statusCode).send(error.toResponse());
    }

    // Fastify validation errors
    const fastifyError = error as Error & { validation?: unknown };
    if (fastifyError.validation) {
      return reply.status(400).send({
        __type: "ValidationException",
        Message: error.message,
      });
    }

    app.log.error(error);
    return reply.status(500).send({
      __type: "InternalServerException",
      Message: "Internal server error",
    });
  });

  // Register handlers
  registerAllHandlers();

  // Register routes
  registerScheduleRoutes(app, repo);
  registerScheduleGroupRoutes(app, repo);
  registerDebugRoutes(app, repo);

  // Health check
  app.get("/health", async () => ({ status: "ok" }));

  return { app, db, repo };
}
