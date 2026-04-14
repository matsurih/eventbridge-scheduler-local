import Database from "better-sqlite3";

export function initDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS schedule_groups (
      name              TEXT PRIMARY KEY,
      arn               TEXT NOT NULL UNIQUE,
      state             TEXT NOT NULL DEFAULT 'ACTIVE',
      creation_date     TEXT NOT NULL,
      last_modification_date TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schedules (
      name                        TEXT NOT NULL,
      group_name                  TEXT NOT NULL DEFAULT 'default',
      arn                         TEXT NOT NULL UNIQUE,
      schedule_expression         TEXT NOT NULL,
      schedule_expression_timezone TEXT NOT NULL DEFAULT 'UTC',
      state                       TEXT NOT NULL DEFAULT 'ENABLED',
      description                 TEXT,
      target_json                 TEXT NOT NULL,
      flexible_time_window_json   TEXT NOT NULL,
      start_date                  TEXT,
      end_date                    TEXT,
      kms_key_arn                 TEXT,
      action_after_completion     TEXT DEFAULT 'NONE',
      last_run                    TEXT,
      creation_date               TEXT NOT NULL,
      last_modification_date      TEXT NOT NULL,
      PRIMARY KEY (name, group_name),
      FOREIGN KEY (group_name) REFERENCES schedule_groups(name)
    );

    CREATE TABLE IF NOT EXISTS execution_history (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_name   TEXT NOT NULL,
      group_name      TEXT NOT NULL DEFAULT 'default',
      fired_at        TEXT NOT NULL,
      target_arn      TEXT NOT NULL,
      status          TEXT NOT NULL,
      error_message   TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Ensure default group exists
  const now = new Date().toISOString();
  db.prepare(
    `
    INSERT OR IGNORE INTO schedule_groups (name, arn, state, creation_date, last_modification_date)
    VALUES ('default', 'arn:aws:scheduler:us-east-1:000000000000:schedule-group/default', 'ACTIVE', ?, ?)
  `
  ).run(now, now);

  return db;
}
