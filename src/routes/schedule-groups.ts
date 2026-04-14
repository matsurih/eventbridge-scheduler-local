import type { FastifyInstance } from "fastify";
import type { ScheduleRepository } from "../db/repository.js";
import type { ScheduleGroup, ScheduleGroupRow } from "../types.js";
import {
  ConflictException,
  ResourceNotFoundException,
  ValidationException,
} from "../util/errors.js";
import { nowISO } from "../util/clock.js";

function groupRowToApi(row: ScheduleGroupRow): ScheduleGroup {
  return {
    Name: row.name,
    Arn: row.arn,
    State: row.state as ScheduleGroup["State"],
    CreationDate: row.creation_date,
    LastModificationDate: row.last_modification_date,
  };
}

export function registerScheduleGroupRoutes(app: FastifyInstance, repo: ScheduleRepository): void {
  // CreateScheduleGroup — POST /schedule-groups/:Name
  app.post<{
    Params: { Name: string };
    Body: { ClientToken?: string; Tags?: Record<string, string>[] };
  }>("/schedule-groups/:Name", async (request, reply) => {
    const name = request.params.Name;

    if (!name) throw new ValidationException("Name is required");

    const existing = repo.getGroup(name);
    if (existing) {
      throw new ConflictException(`Schedule group ${name} already exists.`);
    }

    const ts = nowISO();
    const arn = `arn:aws:scheduler:us-east-1:000000000000:schedule-group/${name}`;

    repo.createGroup({
      name,
      arn,
      state: "ACTIVE",
      creation_date: ts,
      last_modification_date: ts,
    });

    return reply.status(200).send({
      ScheduleGroupArn: arn,
    });
  });

  // GetScheduleGroup — GET /schedule-groups/:Name
  app.get<{
    Params: { Name: string };
  }>("/schedule-groups/:Name", async (request, reply) => {
    const name = request.params.Name;

    const row = repo.getGroup(name);
    if (!row) {
      throw new ResourceNotFoundException(`Schedule group ${name} does not exist.`);
    }

    return reply.status(200).send(groupRowToApi(row));
  });

  // DeleteScheduleGroup — DELETE /schedule-groups/:Name
  app.delete<{
    Params: { Name: string };
  }>("/schedule-groups/:Name", async (request, reply) => {
    const name = request.params.Name;

    if (name === "default") {
      throw new ValidationException("Cannot delete the default schedule group.");
    }

    const deleted = repo.deleteGroup(name);
    if (!deleted) {
      throw new ResourceNotFoundException(`Schedule group ${name} does not exist.`);
    }

    return reply.status(200).send({});
  });

  // ListScheduleGroups — GET /schedule-groups
  app.get<{
    Querystring: {
      NamePrefix?: string;
      NextToken?: string;
      MaxResults?: string;
    };
  }>("/schedule-groups", async (request, reply) => {
    const q = request.query as Record<string, string | undefined>;
    const maxResults = q.MaxResults ? parseInt(q.MaxResults, 10) : 50;

    const { groups, nextToken } = repo.listGroups(q.NextToken, maxResults);

    let filteredGroups = groups;
    if (q.NamePrefix) {
      filteredGroups = groups.filter((g) => g.name.startsWith(q.NamePrefix!));
    }

    const response: Record<string, unknown> = {
      ScheduleGroups: filteredGroups.map(groupRowToApi),
    };

    if (nextToken) {
      response.NextToken = nextToken;
    }

    return reply.status(200).send(response);
  });
}
