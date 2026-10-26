"use server";

import { inngest, movieWatched } from "@/inngest/client";
import { movieWatchedData } from "@/inngest/schemas";

export type SendResult = { ok: true; eventId: string } | { ok: false; error: string };

export async function sendMovieWatched(formData: FormData): Promise<SendResult> {
  // Parse with the same schema the function uses, so the UI can't send what the function would reject.
  const parsed = movieWatchedData.safeParse({
    movie_title: formData.get("movie_title"),
    recipient_email: formData.get("recipient_email"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  try {
    const { ids } = await inngest.send(movieWatched.create(parsed.data));
    return { ok: true, eventId: ids[0] };
  } catch (err) {
    return { ok: false, error: `Could not reach Inngest: ${(err as Error).message}` };
  }
}
