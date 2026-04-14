/**
 * Virtual clock that can be advanced for testing.
 * In normal operation it returns real time.
 */
let offsetMs = 0;

export function now(): Date {
  return new Date(Date.now() + offsetMs);
}

export function nowISO(): string {
  return now().toISOString();
}

export function advanceClock(ms: number): void {
  offsetMs += ms;
}

export function resetClock(): void {
  offsetMs = 0;
}

export function getOffsetMs(): number {
  return offsetMs;
}
