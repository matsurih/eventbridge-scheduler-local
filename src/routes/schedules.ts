import type { FastifyInstance } from "fastify";
import type { ScheduleRepository } from "../db/repository.js";
import type { Schedule, ScheduleRow, Target, FlexibleTimeWindow } from "../types.js";
import {
  ConflictException,
  ResourceNotFoundException,
  ValidationException,
} from "../util/errors.js";
import { parseScheduleExpression } from "../util/expression.js";
import { nowISO } from "../util/clock.js";

function scheduleRowToApi(row: ScheduleRow): Schedule {
  return {
    Name: row.name,
    GroupName: row.group_name,
    Arn: row.arn,
    ScheduleExpression: row.schedule_expression,
    ScheduleExpressionTimezone: row.schedule_expression_timezone,
    State: row.state as Schedule["State"],
    Description: row.description ?? undefined,
    Target: JSON.parse(row.target_json),
    FlexibleTimeWindow: JSON.parse(row.flexible_time_window_json),
    StartDate: row.start_date ?? undefined,
    EndDate: row.end_date ?? undefined,
    KmsKeyArn: row.kms_key_arn ?? undefined,
    CreationDate: row.creation_date,
    LastModificationDate: row.last_modification_date,
    ActionAfterCompletion:
      (row.action_after_completion as Schedule["ActionAfterCompletion"]) ?? undefined,
  };
}

export function registerScheduleRoutes(app: FastifyInstance, repo: ScheduleRepository): void {
  // CreateSchedule — POST /schedules/:Name
  app.post<{
    Params: { Name: string };
    Body: {
      ScheduleExpression: string;
      ScheduleExpressionTimezone?: string;
      Target: Target;
      FlexibleTimeWindow: FlexibleTimeWindow;
      State?: string;
      Description?: string;
      GroupName?: string;
      StartDate?: string;
      EndDate?: string;
      KmsKeyArn?: string;
      ActionAfterCompletion?: string;
      ClientToken?: string;
    };
  }>("/schedules/:Name", async (request, reply) => {
    const name = request.params.Name;
    const body = request.body;

    if (!name) throw new ValidationException("Name is required");
    if (!body.ScheduleExpression) throw new ValidationException("ScheduleExpression is required");
    if (!body.Target) throw new ValidationException("Target is required");
    if (!body.Target.Arn) throw new ValidationException("Target.Arn is required");
    if (!body.FlexibleTimeWindow) throw new ValidationException("FlexibleTimeWindow is required");

    // Validate enum values
    if (body.State && body.State !== "ENABLED" && body.State !== "DISABLED") {
      throw new ValidationException(
        `1 validation error detected: Value '${body.State}' at 'state' failed to satisfy constraint: Member must satisfy enum value set: [ENABLED, DISABLED]`
      );
    }
    if (body.FlexibleTimeWindow.Mode !== "OFF" && body.FlexibleTimeWindow.Mode !== "FLEXIBLE") {
      throw new ValidationException(
        `1 validation error detected: Value '${body.FlexibleTimeWindow.Mode}' at 'flexibleTimeWindow.mode' failed to satisfy constraint: Member must satisfy enum value set: [OFF, FLEXIBLE]`
      );
    }
    if (
      body.ActionAfterCompletion &&
      body.ActionAfterCompletion !== "NONE" &&
      body.ActionAfterCompletion !== "DELETE"
    ) {
      throw new ValidationException(
        `1 validation error detected: Value '${body.ActionAfterCompletion}' at 'actionAfterCompletion' failed to satisfy constraint: Member must satisfy enum value set: [NONE, DELETE]`
      );
    }

    // Validate expression
    parseScheduleExpression(body.ScheduleExpression);

    const groupName = body.GroupName ?? "default";

    // Verify group exists
    if (!repo.groupExists(groupName)) {
      throw new ResourceNotFoundException(`Schedule group ${groupName} does not exist.`);
    }

    // Check for conflict
    const existing = repo.getSchedule(name, groupName);
    if (existing) {
      throw new ConflictException(`Schedule ${name} already exists in group ${groupName}.`);
    }

    const ts = nowISO();
    const arn = `arn:aws:scheduler:us-east-1:000000000000:schedule/${groupName}/${name}`;

    const row: ScheduleRow = {
      name,
      group_name: groupName,
      arn,
      schedule_expression: body.ScheduleExpression,
      schedule_expression_timezone: body.ScheduleExpressionTimezone ?? "UTC",
      state: body.State ?? "ENABLED",
      description: body.Description ?? null,
      target_json: JSON.stringify(body.Target),
      flexible_time_window_json: JSON.stringify(body.FlexibleTimeWindow),
      start_date: body.StartDate ?? null,
      end_date: body.EndDate ?? null,
      kms_key_arn: body.KmsKeyArn ?? null,
      action_after_completion: body.ActionAfterCompletion ?? "NONE",
      last_run: null,
      creation_date: ts,
      last_modification_date: ts,
    };

    repo.createSchedule(row);

    return reply.status(200).send({
      ScheduleArn: arn,
    });
  });

  // GetSchedule — GET /schedules/:Name
  app.get<{
    Params: { Name: string };
    Querystring: { groupName?: string };
  }>("/schedules/:Name", async (request, reply) => {
    const name = request.params.Name;
    const groupName = (request.query as Record<string, string>).groupName ?? "default";

    const row = repo.getSchedule(name, groupName);
    if (!row) {
      throw new ResourceNotFoundException(`Schedule ${name} does not exist in group ${groupName}.`);
    }

    return reply.status(200).send(scheduleRowToApi(row));
  });

  // UpdateSchedule — PUT /schedules/:Name
  app.put<{
    Params: { Name: string };
    Body: {
      ScheduleExpression?: string;
      ScheduleExpressionTimezone?: string;
      Target?: Target;
      FlexibleTimeWindow?: FlexibleTimeWindow;
      State?: string;
      Description?: string;
      GroupName?: string;
      StartDate?: string;
      EndDate?: string;
      KmsKeyArn?: string;
      ActionAfterCompletion?: string;
      ClientToken?: string;
    };
  }>("/schedules/:Name", async (request, reply) => {
    const name = request.params.Name;
    const body = request.body;
    const groupName = body.GroupName ?? "default";

    const existing = repo.getSchedule(name, groupName);
    if (!existing) {
      throw new ResourceNotFoundException(`Schedule ${name} does not exist in group ${groupName}.`);
    }

    if (body.ScheduleExpression) {
      parseScheduleExpression(body.ScheduleExpression);
    }
    if (body.State && body.State !== "ENABLED" && body.State !== "DISABLED") {
      throw new ValidationException(
        `1 validation error detected: Value '${body.State}' at 'state' failed to satisfy constraint: Member must satisfy enum value set: [ENABLED, DISABLED]`
      );
    }
    if (
      body.FlexibleTimeWindow &&
      body.FlexibleTimeWindow.Mode !== "OFF" &&
      body.FlexibleTimeWindow.Mode !== "FLEXIBLE"
    ) {
      throw new ValidationException(
        `1 validation error detected: Value '${body.FlexibleTimeWindow.Mode}' at 'flexibleTimeWindow.mode' failed to satisfy constraint: Member must satisfy enum value set: [OFF, FLEXIBLE]`
      );
    }
    if (
      body.ActionAfterCompletion &&
      body.ActionAfterCompletion !== "NONE" &&
      body.ActionAfterCompletion !== "DELETE"
    ) {
      throw new ValidationException(
        `1 validation error detected: Value '${body.ActionAfterCompletion}' at 'actionAfterCompletion' failed to satisfy constraint: Member must satisfy enum value set: [NONE, DELETE]`
      );
    }
    if (body.Target && !body.Target.Arn) {
      throw new ValidationException("Target.Arn is required");
    }

    const ts = nowISO();

    const row: ScheduleRow = {
      name,
      group_name: groupName,
      arn: existing.arn,
      schedule_expression: body.ScheduleExpression ?? existing.schedule_expression,
      schedule_expression_timezone:
        body.ScheduleExpressionTimezone ?? existing.schedule_expression_timezone,
      state: body.State ?? existing.state,
      description: body.Description !== undefined ? body.Description : existing.description,
      target_json: body.Target ? JSON.stringify(body.Target) : existing.target_json,
      flexible_time_window_json: body.FlexibleTimeWindow
        ? JSON.stringify(body.FlexibleTimeWindow)
        : existing.flexible_time_window_json,
      start_date: body.StartDate !== undefined ? body.StartDate : existing.start_date,
      end_date: body.EndDate !== undefined ? body.EndDate : existing.end_date,
      kms_key_arn: body.KmsKeyArn !== undefined ? body.KmsKeyArn : existing.kms_key_arn,
      action_after_completion: body.ActionAfterCompletion ?? existing.action_after_completion,
      last_run: existing.last_run,
      creation_date: existing.creation_date,
      last_modification_date: ts,
    };

    repo.updateSchedule(row);

    return reply.status(200).send({
      ScheduleArn: existing.arn,
    });
  });

  // DeleteSchedule — DELETE /schedules/:Name
  app.delete<{
    Params: { Name: string };
    Querystring: { groupName?: string };
  }>("/schedules/:Name", async (request, reply) => {
    const name = request.params.Name;
    const groupName = (request.query as Record<string, string>).groupName ?? "default";

    const deleted = repo.deleteSchedule(name, groupName);
    if (!deleted) {
      throw new ResourceNotFoundException(`Schedule ${name} does not exist in group ${groupName}.`);
    }

    return reply.status(200).send({});
  });

  // ListSchedules — GET /schedules
  app.get<{
    Querystring: {
      GroupName?: string;
      NamePrefix?: string;
      State?: string;
      NextToken?: string;
      MaxResults?: string;
    };
  }>("/schedules", async (request, reply) => {
    const q = request.query as Record<string, string | undefined>;
    const maxResults = q.MaxResults ? parseInt(q.MaxResults, 10) : 50;

    const { schedules, nextToken } = repo.listSchedules(
      q.GroupName,
      q.State,
      q.NamePrefix,
      q.NextToken,
      maxResults
    );

    const response: Record<string, unknown> = {
      Schedules: schedules.map((s) => ({
        Name: s.name,
        GroupName: s.group_name,
        Arn: s.arn,
        State: s.state,
        ScheduleExpression: s.schedule_expression,
        Target: { Arn: JSON.parse(s.target_json).Arn },
        CreationDate: s.creation_date,
        LastModificationDate: s.last_modification_date,
      })),
    };

    if (nextToken) {
      response.NextToken = nextToken;
    }

    return reply.status(200).send(response);
  });
}
