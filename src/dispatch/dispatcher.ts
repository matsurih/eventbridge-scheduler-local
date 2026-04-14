import type { Target, DispatchContext } from "../types.js";
import { getHandler } from "./registry.js";
import { sendToDeadLetterQueue } from "./handlers.js";

/**
 * Dispatch a target with retry logic.
 * Respects RetryPolicy.MaximumRetryAttempts and MaximumEventAgeInSeconds.
 */
export async function dispatchTarget(
  target: Target,
  ctx: DispatchContext
): Promise<{ success: boolean; error?: string }> {
  const maxRetries = target.RetryPolicy?.MaximumRetryAttempts ?? 0;
  const maxAgeSeconds = target.RetryPolicy?.MaximumEventAgeInSeconds ?? 86400;
  const firedAt = new Date(ctx.firedAt).getTime();

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check event age
    if (Date.now() - firedAt > maxAgeSeconds * 1000) {
      const msg = `Event age exceeded MaximumEventAgeInSeconds (${maxAgeSeconds}s)`;
      console.warn(`[dispatch] ${msg} for schedule ${ctx.scheduleName}`);
      lastError = new Error(msg);
      break;
    }

    try {
      const handler = getHandler(target.Arn);
      if (handler) {
        await handler(target, ctx);
      }
      return { success: true };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(
        `[dispatch] Attempt ${attempt + 1}/${maxRetries + 1} failed for ${ctx.scheduleName}: ${lastError.message}`
      );
      if (attempt < maxRetries) {
        // Simple exponential backoff: 1s, 2s, 4s...
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
  }

  // All retries exhausted — send to DLQ if configured
  if (lastError && target.DeadLetterConfig?.Arn) {
    await sendToDeadLetterQueue(target.DeadLetterConfig.Arn, lastError, target, ctx);
  }

  return { success: false, error: lastError?.message };
}
