import { Inngest, eventType } from "inngest";
import { z } from "zod";
import { MOVIE_RECAP_FAILED, MOVIE_WATCHED, movieWatchedData } from "./schemas";

export const inngest = new Inngest({ id: "meadow-event" });

export const movieWatched = eventType(MOVIE_WATCHED, { schema: movieWatchedData });

export const movieRecapFailed = eventType(MOVIE_RECAP_FAILED, {
  schema: z.object({
    movie_title: z.string(),
    recipient_email: z.string(),
    reason: z.string(),
  }),
});
