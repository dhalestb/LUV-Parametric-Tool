/** Opt-in, synchronous diagnostic scope. No console output or retained data in normal use. */
export type ConnectionTrace = {
  counts: Record<string, number>;
  events: Array<{ stage: string; reason: string; detail: Record<string, unknown> }>;
  droppedEvents: number;
  timings: Record<string, { calls: number; inclusiveMs: number; exclusiveMs: number }>;
};
type Scope = { trace: ConnectionTrace; limit: number; stack: Array<{ childMs: number }> };
let active: Scope | undefined;
export function connectionDiagnosticsEnabled() { return active !== undefined; }

/** For a single opt-in asynchronous search run. Concurrent captures are deliberately unsupported. */
export async function captureConnectionDiagnosticsAsync<T>(run: () => Promise<T>, limit = 20000) {
  if (active) throw new Error("A connection diagnostic capture is already active.");
  const scope: Scope = { trace: { counts: {}, events: [], droppedEvents: 0, timings: {} }, limit, stack: [] };
  active = scope;
  try { return { value: await run(), trace: scope.trace }; }
  finally { active = undefined; }
}

export function captureConnectionDiagnostics<T>(run: () => T, limit = 20000) {
  const previous = active;
  const scope: Scope = { trace: { counts: {}, events: [], droppedEvents: 0, timings: {} }, limit, stack: [] };
  active = scope;
  try { return { value: run(), trace: scope.trace }; }
  finally { active = previous; }
}

export function connectionDiagnostic(stage: string, reason: string, detail: Record<string, unknown> = {}) {
  if (!active) return;
  const key = `${stage}: ${reason}`;
  active.trace.counts[key] = (active.trace.counts[key] ?? 0) + 1;
  if (active.trace.events.length < active.limit) active.trace.events.push({ stage, reason, detail });
  else active.trace.droppedEvents++;
}

const noop = () => {};
/** Nested timings expose both inclusive and exclusive cost; never add inclusive columns. */
export function startConnectionTiming(stage: string): () => void {
  if (!active) return noop;
  const scope = active, frame = { childMs: 0 }, start = performance.now();
  scope.stack.push(frame);
  return () => {
    const elapsed = performance.now() - start;
    scope.stack.pop();
    const parent = scope.stack[scope.stack.length - 1];
    if (parent) parent.childMs += elapsed;
    const record = scope.trace.timings[stage] ??= { calls: 0, inclusiveMs: 0, exclusiveMs: 0 };
    record.calls++;
    record.inclusiveMs += elapsed;
    record.exclusiveMs += elapsed - frame.childMs;
  };
}
