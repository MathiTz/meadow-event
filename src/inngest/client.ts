import { Inngest, eventType } from "inngest";
import { z } from "zod";
import { MOVIE_EMAIL_FAILED, MOVIE_WATCHED, movieWatchedData } from "./schemas";

export const inngest = new Inngest({ id: "meadow-event" });

export const movieWatched = eventType(MOVIE_WATCHED, { schema: movieWatchedData });

export const movieEmailFailed = eventType(MOVIE_EMAIL_FAILED, {
  schema: z.object({
    movie_title: z.string(),
    recipient_email: z.string(),
    reason: z.string(),
  }),
});
