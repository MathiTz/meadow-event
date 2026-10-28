import { NonRetriableError, RetryAfterError } from "inngest";
import { inngest, movieRecapFailed, movieWatched } from "../client";
import { sendMovieEmail } from "@/lib/email";
import { MovieNotFoundError, ServiceError } from "@/lib/errors";
import { fetchMovie } from "@/lib/omdb";

/** Translate our service errors into Inngest's retry semantics. */
function toInngestError(err: unknown): Error {
  if (!(err instanceof ServiceError)) return err as Error; // unknown => default retry policy
  if (!err.retriable) return new NonRetriableError(err.message, { cause: err });
  if (err.retryAfterSeconds) return new RetryAfterError(err.message, `${err.retryAfterSeconds}s`, { cause: err });
  return err;
}

export const sendMoviePlot = inngest.createFunction(
  {
    id: "send-movie-plot",
    triggers: [movieWatched],
    retries: 5, // default backoff is exponential; 6 attempts total
    // Resend's default limit is 2 req/s per team; queue instead of failing with 429s.
    throttle: { limit: 2, period: "1s" },
    concurrency: 10,
    // Hard limit (excess runs are skipped, not queued): one recap per recipient + movie per minute, however the event was sent.
    rateLimit: { limit: 1, period: "1m", key: 'event.data.recipient_email + "|" + event.data.movie_title' },
    onFailure: async ({ event, error, step }) => {
      const original = event.data.event.data as { movie_title?: string; recipient_email?: string };
      await step.sendEvent(
        "notify-failure",
        movieRecapFailed.create({
          movie_title: original.movie_title ?? "",
          recipient_email: original.recipient_email ?? "",
          reason: error.message,
        }),
      );
    },
  },
  async ({ event, step }) => {
    const { movie_title, recipient_email } = event.data;

    // Separate steps: if the email fails, retries reuse the memoized OMDb result.
    const lookup = await step.run("fetch-movie", async () => {
      try {
        return { movie: await fetchMovie(movie_title) };
      } catch (err) {
        // Unknown title is an expected outcome: tell the recipient instead of failing the run.
        if (err instanceof MovieNotFoundError) return { movie: null };
        throw toInngestError(err);
      }
    });

    const email = await step.run("send-email", async () => {
      try {
        return await sendMovieEmail({ to: recipient_email, movie: lookup.movie ?? { notFoundTitle: movie_title }, idempotencyKey: `movie-watched/${event.id}` });
      } catch (err) {
        throw toInngestError(err);
      }
    });

    return {
      outcome: lookup.movie ? "plot_sent" : "not_found_sent",
      title: lookup.movie?.title ?? movie_title,
      recipient: recipient_email,
      emailId: email.id,
    };
  },
);
