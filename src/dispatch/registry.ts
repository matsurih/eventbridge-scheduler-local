import type { Target, DispatchContext } from "../types.js";

export type TargetHandler = (target: Target, ctx: DispatchContext) => Promise<void>;

interface HandlerEntry {
  pattern: RegExp;
  handler: TargetHandler;
}

const handlers: HandlerEntry[] = [];

export function registerHandler(pattern: RegExp, handler: TargetHandler): void {
  handlers.push({ pattern, handler });
}

export function getHandler(arn: string): TargetHandler | undefined {
  for (const entry of handlers) {
    if (entry.pattern.test(arn)) {
      return entry.handler;
    }
  }
  return undefined;
}

export function clearHandlers(): void {
  handlers.length = 0;
}
