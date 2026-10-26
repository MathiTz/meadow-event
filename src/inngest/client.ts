import { Inngest, eventType } from "inngest";
import { z } from "zod";

export const inngest = new Inngest({ id: "meadow-event" });

export const movieWatched = eventType("meadow_api/movie.watched", {
  schema: z.object({
    movie_title: z.string().trim().min(1),
    recipient_email: z.string().trim().email(),
  }),
});

export const movieEmailFailed = eventType("meadow_api/movie.email.failed", {
  schema: z.object({
    movie_title: z.string(),
    recipient_email: z.string(),
    reason: z.string(),
  }),
});
