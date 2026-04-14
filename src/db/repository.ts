import type Database from "better-sqlite3";
import type {
  HistoryRow,
  ScheduleGroupRow,
  ScheduleRow,
} from "../types.js";

export class ScheduleRepository {
  constructor(private db: Database.Database) {}

  // --- Schedule Groups ---

  createGroup(row: ScheduleGroupRow): void {
    this.db
      .prepare(
        `INSERT INTO schedule_groups (name, arn, state, creation_date, last_modification_date)
         VALUES (@name, @arn, @state, @creation_date, @last_modification_date)`
      )
      .run(row);
  }

  getGroup(name: string): ScheduleGroupRow | undefined {
    return this.db
      .prepare("SELECT * FROM schedule_groups WHERE name = ?")
      .get(name) as ScheduleGroupRow | undefined;
  }

  deleteGroup(name: string): boolean {
    // Delete all schedules in the group first
    this.db
      .prepare("DELETE FROM schedules WHERE group_name = ?")
      .run(name);
    const result = this.db
      .prepare("DELETE FROM schedule_groups WHERE name = ? AND name != 'default'")
      .run(name);
    return result.changes > 0;
  }

  listGroups(nextToken?: string, maxResults = 50): { groups: ScheduleGroupRow[]; nextToken?: string } {
    const offset = nextToken ? parseInt(nextToken, 10) : 0;
    const groups = this.db
      .prepare("SELECT * FROM schedule_groups ORDER BY name LIMIT ? OFFSET ?")
      .all(maxResults + 1, offset) as ScheduleGroupRow[];

    const hasMore = groups.length > maxResults;
    if (hasMore) groups.pop();

    return {
      groups,
      nextToken: hasMore ? String(offset + maxResults) : undefined,
    };
  }

  groupExists(name: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM schedule_groups WHERE name = ?")
      .get(name);
    return row !== undefined;
  }

  // --- Schedules ---

  createSchedule(row: ScheduleRow): void {
    this.db
      .prepare(
        `INSERT INTO schedules (
          name, group_name, arn, schedule_expression, schedule_expression_timezone,
          state, description, target_json, flexible_time_window_json,
          start_date, end_date, kms_key_arn, action_after_completion,
          last_run, creation_date, last_modification_date
        ) VALUES (
          @name, @group_name, @arn, @schedule_expression, @schedule_expression_timezone,
          @state, @description, @target_json, @flexible_time_window_json,
          @start_date, @end_date, @kms_key_arn, @action_after_completion,
          @last_run, @creation_date, @last_modification_date
        )`
      )
      .run(row);
  }

  getSchedule(name: string, groupName: string): ScheduleRow | undefined {
    return this.db
      .prepare("SELECT * FROM schedules WHERE name = ? AND group_name = ?")
      .get(name, groupName) as ScheduleRow | undefined;
  }

  updateSchedule(row: ScheduleRow): void {
    this.db
      .prepare(
        `UPDATE schedules SET
          arn = @arn,
          schedule_expression = @schedule_expression,
          schedule_expression_timezone = @schedule_expression_timezone,
          state = @state,
          description = @description,
          target_json = @target_json,
          flexible_time_window_json = @flexible_time_window_json,
          start_date = @start_date,
          end_date = @end_date,
          kms_key_arn = @kms_key_arn,
          action_after_completion = @action_after_completion,
          last_modification_date = @last_modification_date
        WHERE name = @name AND group_name = @group_name`
      )
      .run(row);
  }

  deleteSchedule(name: string, groupName: string): boolean {
    const result = this.db
      .prepare("DELETE FROM schedules WHERE name = ? AND group_name = ?")
      .run(name, groupName);
    return result.changes > 0;
  }

  listSchedules(
    groupName?: string,
    state?: string,
    namePrefix?: string,
    nextToken?: string,
    maxResults = 50
  ): { schedules: ScheduleRow[]; nextToken?: string } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (groupName) {
      conditions.push("group_name = ?");
      params.push(groupName);
    }
    if (state) {
      conditions.push("state = ?");
      params.push(state);
    }
    if (namePrefix) {
      conditions.push("name LIKE ?");
      params.push(namePrefix + "%");
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = nextToken ? parseInt(nextToken, 10) : 0;
    params.push(maxResults + 1, offset);

    const schedules = this.db
      .prepare(`SELECT * FROM schedules ${where} ORDER BY name LIMIT ? OFFSET ?`)
      .all(...params) as ScheduleRow[];

    const hasMore = schedules.length > maxResults;
    if (hasMore) schedules.pop();

    return {
      schedules,
      nextToken: hasMore ? String(offset + maxResults) : undefined,
    };
  }

  getEnabledSchedules(): ScheduleRow[] {
    return this.db
      .prepare("SELECT * FROM schedules WHERE state = 'ENABLED'")
      .all() as ScheduleRow[];
  }

  updateLastRun(name: string, groupName: string, lastRun: string): void {
    this.db
      .prepare("UPDATE schedules SET last_run = ? WHERE name = ? AND group_name = ?")
      .run(lastRun, name, groupName);
  }

  disableSchedule(name: string, groupName: string): void {
    this.db
      .prepare("UPDATE schedules SET state = 'DISABLED' WHERE name = ? AND group_name = ?")
      .run(name, groupName);
  }

  // --- Execution History ---

  recordExecution(row: Omit<HistoryRow, "id">): void {
    this.db
      .prepare(
        `INSERT INTO execution_history (schedule_name, group_name, fired_at, target_arn, status, error_message)
         VALUES (@schedule_name, @group_name, @fired_at, @target_arn, @status, @error_message)`
      )
      .run(row);
  }

  getHistory(
    scheduleName?: string,
    groupName?: string,
    limit = 100
  ): HistoryRow[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (scheduleName) {
      conditions.push("schedule_name = ?");
      params.push(scheduleName);
    }
    if (groupName) {
      conditions.push("group_name = ?");
      params.push(groupName);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit);

    return this.db
      .prepare(`SELECT * FROM execution_history ${where} ORDER BY id DESC LIMIT ?`)
      .all(...params) as HistoryRow[];
  }

  /** Run a callback inside a transaction */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}
