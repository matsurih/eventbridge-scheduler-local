import { config } from "../config.js";
import type { Target, DispatchContext } from "../types.js";
import { registerHandler } from "./registry.js";

/** Extract region, account, and resource from an ARN */
function parseArn(arn: string) {
  // arn:aws:service:region:account:resource-type/resource
  const parts = arn.split(":");
  return {
    service: parts[2],
    region: parts[3],
    account: parts[4],
    resource: parts.slice(5).join(":"),
  };
}

// --- SQS Handler ---
async function sqsHandler(target: Target, ctx: DispatchContext): Promise<void> {
  const { resource } = parseArn(target.Arn);
  // resource = "queue-name" or "account/queue-name"
  const queueName = resource.split("/").pop()!;
  const queueUrl = `${config.sqsEndpoint}/000000000000/${queueName}`;

  const params = new URLSearchParams({
    Action: "SendMessage",
    MessageBody: target.Input ?? "{}",
    Version: "2012-11-05",
  });

  if (target.SqsParameters?.MessageGroupId) {
    params.set("MessageGroupId", target.SqsParameters.MessageGroupId);
  }

  const resp = await fetch(queueUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`SQS SendMessage failed (${resp.status}): ${body}`);
  }

  console.log(
    `[dispatch] SQS message sent to ${queueName} for schedule ${ctx.scheduleName}`
  );
}

// --- Lambda Handler ---
async function lambdaHandler(
  target: Target,
  ctx: DispatchContext
): Promise<void> {
  const { resource } = parseArn(target.Arn);
  // resource = "function:my-function" or "function:my-function:qualifier"
  const functionName = resource.replace(/^function:/, "").split(":")[0];

  const url = `${config.lambdaEndpoint}/2015-03-31/functions/${functionName}/invocations`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: target.Input ?? "{}",
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Lambda Invoke failed (${resp.status}): ${body}`);
  }

  console.log(
    `[dispatch] Lambda ${functionName} invoked for schedule ${ctx.scheduleName}`
  );
}

// --- HTTP Handler (custom extension) ---
async function httpHandler(
  target: Target,
  ctx: DispatchContext
): Promise<void> {
  const resp = await fetch(target.Arn, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: target.Input ?? "{}",
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`HTTP target failed (${resp.status}): ${body}`);
  }

  console.log(
    `[dispatch] HTTP POST to ${target.Arn} for schedule ${ctx.scheduleName}`
  );
}

// --- Fallback Handler ---
async function fallbackHandler(
  target: Target,
  ctx: DispatchContext
): Promise<void> {
  console.log(
    `[dispatch] No handler for ARN pattern ${target.Arn}, schedule ${ctx.scheduleName} — logged and skipped`
  );
}

// --- DLQ Helper ---
export async function sendToDeadLetterQueue(
  dlqArn: string,
  error: Error,
  target: Target,
  ctx: DispatchContext
): Promise<void> {
  try {
    const { resource } = parseArn(dlqArn);
    const queueName = resource.split("/").pop()!;
    const queueUrl = `${config.sqsEndpoint}/000000000000/${queueName}`;

    const dlqMessage = JSON.stringify({
      error: error.message,
      scheduleName: ctx.scheduleName,
      groupName: ctx.groupName,
      firedAt: ctx.firedAt,
      targetArn: target.Arn,
      input: target.Input,
    });

    const params = new URLSearchParams({
      Action: "SendMessage",
      MessageBody: dlqMessage,
      Version: "2012-11-05",
    });

    await fetch(queueUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    console.log(
      `[dispatch] Sent failed event to DLQ ${queueName} for schedule ${ctx.scheduleName}`
    );
  } catch (dlqError) {
    console.error(`[dispatch] Failed to send to DLQ ${dlqArn}:`, dlqError);
  }
}

// --- Register all handlers ---
export function registerAllHandlers(): void {
  registerHandler(/^arn:aws:sqs:/, sqsHandler);
  registerHandler(/^arn:aws:lambda:/, lambdaHandler);
  registerHandler(/^https?:\/\//, httpHandler);
  // fallback must be last
  registerHandler(/.*/, fallbackHandler);
}
