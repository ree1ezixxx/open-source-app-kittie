/* ============================================================
   Run event bus — live observability for the builder pipeline.

   The message pipeline (POST /projects/:id/messages) processes
   synchronously, but the client only learns the runId from the POST
   response — which resolves AFTER processing finishes. So a client
   subscribing live would miss every event.

   The replay buffer solves the ordering problem: every event for a run
   is retained until the run ends + a short TTL. The SSE endpoint replays
   the whole buffer on connect, THEN streams anything still to come. So
   even though the client connects late, it sees the full real sequence.

   In-memory only — restarting the API drops buffers (acceptable; runs are
   ephemeral and already persisted as AgentRun transcripts).

   Event shape (PRD §12.5):
     { type, ts, ...payload }
   ============================================================ */

export type RunEventType =
  | "phase_started"
  | "phase_completed"
  | "log"
  | "file_changed"
  | "error_detected"
  | "repair_attempt"
  | "preview_ready"
  | "run_failed"
  | "run_success";

export interface RunEvent {
  type: RunEventType;
  ts: number;
  /** free-form payload — phase name, log line, file path, error, etc. */
  [key: string]: unknown;
}

type Listener = (event: RunEvent) => void;

interface RunChannel {
  events: RunEvent[];
  listeners: Set<Listener>;
  ended: boolean;
  /** timer that drops the buffer once a run has ended */
  evictAt: number | null;
}

const RETAIN_AFTER_END_MS = 5 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

const channels = new Map<string, RunChannel>();

function channel(runId: string): RunChannel {
  let ch = channels.get(runId);
  if (!ch) {
    ch = { events: [], listeners: new Set(), ended: false, evictAt: null };
    channels.set(runId, ch);
  }
  return ch;
}

/** Emit an event for a run: buffer it and fan out to live subscribers. */
export function emitRunEvent(
  runId: string,
  event: { type: RunEventType; ts?: number; [key: string]: unknown },
): RunEvent {
  const full: RunEvent = { ...event, type: event.type, ts: event.ts ?? Date.now() };
  const ch = channel(runId);
  ch.events.push(full);
  for (const l of ch.listeners) {
    try {
      l(full);
    } catch {
      /* a bad listener never breaks the emit */
    }
  }
  if (full.type === "run_success" || full.type === "run_failed") {
    ch.ended = true;
    ch.evictAt = Date.now() + RETAIN_AFTER_END_MS;
  }
  return full;
}

/** Snapshot the buffered events for a run (for SSE replay). */
export function bufferedEvents(runId: string): RunEvent[] {
  return channels.get(runId)?.events.slice() ?? [];
}

export function isRunEnded(runId: string): boolean {
  return channels.get(runId)?.ended ?? false;
}

/**
 * Subscribe to live events for a run. Returns an unsubscribe fn.
 * Does NOT replay — callers replay via bufferedEvents() first, then
 * subscribe, accepting the (tiny) overlap window which the SSE layer
 * de-dupes by event index.
 */
export function subscribe(runId: string, listener: Listener): () => void {
  const ch = channel(runId);
  ch.listeners.add(listener);
  return () => {
    ch.listeners.delete(listener);
  };
}

let sweeper: ReturnType<typeof setInterval> | null = null;

export function startRunEventSweeper(): void {
  if (sweeper) return;
  sweeper = setInterval(() => {
    const now = Date.now();
    for (const [runId, ch] of channels) {
      if (ch.ended && ch.evictAt != null && now > ch.evictAt && ch.listeners.size === 0) {
        channels.delete(runId);
      }
    }
  }, SWEEP_INTERVAL_MS);
  if (sweeper.unref) sweeper.unref();
}
