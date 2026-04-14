/**
 * Minimal example: create a schedule that fires every 1 minute
 * and POSTs to an HTTP webhook.
 *
 * Usage:
 *   npx tsx examples/create-schedule.ts
 *
 * Prerequisites:
 *   npm install @aws-sdk/client-scheduler
 */
import {
  SchedulerClient,
  CreateScheduleCommand,
  GetScheduleCommand,
} from "@aws-sdk/client-scheduler";

const client = new SchedulerClient({
  endpoint: "http://localhost:4590",
  region: "ap-northeast-1",
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});

// Create a schedule that fires every minute
const createResult = await client.send(
  new CreateScheduleCommand({
    Name: "ping",
    ScheduleExpression: "rate(1 minutes)",
    FlexibleTimeWindow: { Mode: "OFF" },
    Target: {
      Arn: "http://host.docker.internal:3000/webhook",
      RoleArn: "arn:aws:iam::000000000000:role/local",
      Input: JSON.stringify({ hello: "world" }),
    },
  })
);

console.log("Created schedule:", createResult.ScheduleArn);

// Verify it was created
const getResult = await client.send(
  new GetScheduleCommand({ Name: "ping" })
);

console.log("Schedule details:", {
  Name: getResult.Name,
  State: getResult.State,
  Expression: getResult.ScheduleExpression,
  Target: getResult.Target?.Arn,
});
