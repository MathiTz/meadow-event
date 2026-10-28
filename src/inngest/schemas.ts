import { z } from "zod";

// Shared by both SDK flavours (v3/v4), the demo server action and the e2e runner.
export const movieWatchedData = z.object({
  movie_title: z.string().trim().min(1),
  // Lower-cased so "Ann@x.com" and "ann@x.com" are the same recipient for de-duplication.
  recipient_email: z.string().trim().toLowerCase().email(),
});
export type MovieWatchedData = z.infer<typeof movieWatchedData>;

export const MOVIE_WATCHED = "meadow_api/movie.watched";
export const MOVIE_RECAP_FAILED = "meadow_api/movie.recap.failed";
