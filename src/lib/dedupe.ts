import { createHash } from "node:crypto";
import type { MovieWatchedData } from "@/inngest/schemas";

/** Window in which the same recipient + movie counts as one request. Mirrors the function's `rateLimit` period. */
export const DEDUPE_WINDOW_MS = 60_000;

/**
 * Deterministic Inngest event id: the same recipient + movie inside one window gets the same id,
 * and Inngest drops an event whose id it has already seen. The time bucket keeps a later, deliberate
 * rewatch from being swallowed forever. A bucket boundary can let one duplicate through; the
 * function-level `rateLimit` is the backstop for that and for senders that don't set an id.
 */
export function watchEventId({ movie_title, recipient_email }: MovieWatchedData, now = Date.now()): string {
  const hash = createHash("sha256")
    .update(`${recipient_email.trim().toLowerCase()}|${movie_title.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 16);
  return `watch-${hash}-${Math.floor(now / DEDUPE_WINDOW_MS)}`;
}
