import { config } from "./config.js";
import { buildApp } from "./app.js";
import { startEngine, stopEngine } from "./engine/executor.js";

const { app, db, repo } = buildApp(config.dbPath);

// Start the execution engine
startEngine(repo);

// Graceful shutdown
const shutdown = async () => {
  console.log("[main] Shutting down...");
  stopEngine();
  await app.close();
  db.close();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(
    `[main] EventBridge Scheduler Local running on port ${config.port}`
  );
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
