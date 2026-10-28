"use server";

import { headers } from "next/headers";
import { inngest, movieWatched } from "@/inngest/client";
import { movieWatchedData } from "@/inngest/schemas";
import { watchEventId } from "@/lib/dedupe";
import { createLimiter } from "@/lib/rate-limit";

// The action is a public endpoint: cap how many events one client can create per minute.
const limiter = createLimiter({ limit: 5, windowMs: 60_000 });

export type SendResult = { ok: true; eventId: string } | { ok: false; error: string };

export async function sendMovieWatched(formData: FormData): Promise<SendResult> {
  const h = await headers();
  const client = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  const allowed = limiter.check(client);
  if (!allowed.ok) return { ok: false, error: `Too many requests. Try again in ${allowed.retryAfterSeconds}s.` };

  // Parse with the same schema the function uses, so the UI can't send what the function would reject.
  const parsed = movieWatchedData.safeParse({
    movie_title: formData.get("movie_title"),
    recipient_email: formData.get("recipient_email"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  try {
    const { ids } = await inngest.send(movieWatched.create(parsed.data, { id: watchEventId(parsed.data) }));
    return { ok: true, eventId: ids[0] };
  } catch (err) {
    return { ok: false, error: `Could not reach Inngest: ${(err as Error).message}` };
  }
}
