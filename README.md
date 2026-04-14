# eventbridge-scheduler-local

AWS EventBridge Scheduler API-compatible local mock server. Apps can use the standard `@aws-sdk/client-scheduler` `SchedulerClient` by pointing the `endpoint` to this server — no code changes needed.

## Why?

LocalStack's EventBridge Scheduler support doesn't actually fire schedules. This server fills that gap: schedules you create via the API are evaluated every second and targets are dispatched in real time.

## Quick Start

### Docker Compose

```yaml
services:
  scheduler:
    image: eventbridge-scheduler-local
    build: .
    ports:
      - "4590:4590"
    environment:
      SCHEDULER_SQS_ENDPOINT: http://localstack:4566
      SCHEDULER_LAMBDA_ENDPOINT: http://localstack:4566
```

### Local Development

```bash
npm install
npm run dev     # tsx watch mode
npm run build   # compile TypeScript
npm start       # run compiled JS
npm test        # run vitest
```

## Configuration

| Variable                    | Default                 | Description                                 |
| --------------------------- | ----------------------- | ------------------------------------------- |
| `PORT`                      | `4590`                  | Server port                                 |
| `DB_PATH`                   | `:memory:`              | SQLite path (`:memory:` or file path)       |
| `SCHEDULER_SQS_ENDPOINT`    | `http://localhost:4566` | SQS endpoint for target dispatch            |
| `SCHEDULER_LAMBDA_ENDPOINT` | `http://localhost:4566` | Lambda endpoint for target dispatch         |
| `NODE_ENV`                  | `development`           | Set `production` to disable debug endpoints |

## SDK Usage

```typescript
import { SchedulerClient, CreateScheduleCommand } from "@aws-sdk/client-scheduler";

const client = new SchedulerClient({
  endpoint: "http://localhost:4590",
  region: "us-east-1",
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});

await client.send(
  new CreateScheduleCommand({
    Name: "my-schedule",
    ScheduleExpression: "rate(5 minutes)",
    Target: {
      Arn: "arn:aws:sqs:us-east-1:000000000000:my-queue",
      RoleArn: "arn:aws:iam::000000000000:role/scheduler-role",
      Input: JSON.stringify({ hello: "world" }),
    },
    FlexibleTimeWindow: { Mode: "OFF" },
  })
);
```

## Supported APIs

| Method | Path                      | Action              |
| ------ | ------------------------- | ------------------- |
| POST   | `/schedules/{Name}`       | CreateSchedule      |
| GET    | `/schedules/{Name}`       | GetSchedule         |
| PUT    | `/schedules/{Name}`       | UpdateSchedule      |
| DELETE | `/schedules/{Name}`       | DeleteSchedule      |
| GET    | `/schedules`              | ListSchedules       |
| POST   | `/schedule-groups/{Name}` | CreateScheduleGroup |
| GET    | `/schedule-groups/{Name}` | GetScheduleGroup    |
| DELETE | `/schedule-groups/{Name}` | DeleteScheduleGroup |
| GET    | `/schedule-groups`        | ListScheduleGroups  |

## Schedule Expressions

- **`rate(N unit)`** — `minutes`, `hours`, `days`
- **`cron(min hour dom month dow year)`** — AWS 6-field format (`?` normalized to `*`, year dropped)
- **`at(yyyy-MM-ddTHH:mm:ss)`** — one-shot, auto-disables after firing

`ScheduleExpressionTimezone` is respected (default: UTC).

## Target Dispatch

Targets are dispatched based on the `Arn` pattern:

| Pattern                 | Handler                                         |
| ----------------------- | ----------------------------------------------- |
| `arn:aws:sqs:*`         | SQS `SendMessage` via `SCHEDULER_SQS_ENDPOINT`  |
| `arn:aws:lambda:*`      | Lambda `Invoke` via `SCHEDULER_LAMBDA_ENDPOINT` |
| `http://` or `https://` | HTTP POST (custom extension)                    |
| Everything else         | Log-only fallback                               |

Retry policy (`MaximumRetryAttempts`, `MaximumEventAgeInSeconds`) and dead letter queue (`DeadLetterConfig.Arn`) are supported.

## Debug Endpoints

Available when `NODE_ENV != production`:

| Method | Path                       | Description                                  |
| ------ | -------------------------- | -------------------------------------------- |
| POST   | `/_debug/tick?advance=1h`  | Advance virtual clock and trigger evaluation |
| POST   | `/_debug/fire/{name}`      | Manually fire a schedule immediately         |
| GET    | `/_debug/schedules`        | All schedules in internal format             |
| GET    | `/_debug/history?name=...` | Execution history                            |
