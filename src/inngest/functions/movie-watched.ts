import { NonRetriableError, RetryAfterError } from "inngest";
import { inngest } from "../client";
import { MOVIE_EMAIL_FAILED, MOVIE_WATCHED, movieWatchedData } from "../schemas";
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
    retries: 5, // default backoff is exponential; 6 attempts total
    // Resend's default limit is 2 req/s per team; queue instead of failing with 429s.
    throttle: { limit: 2, period: "1s" },
    concurrency: 10,
    onFailure: async ({ event, error, step }) => {
      const original = event.data.event.data as { movie_title?: string; recipient_email?: string };
      await step.sendEvent("notify-failure", {
        name: MOVIE_EMAIL_FAILED,
        data: {
          movie_title: original.movie_title ?? "",
          recipient_email: original.recipient_email ?? "",
          reason: error.message,
        },
      });
    },
  },
  { event: MOVIE_WATCHED },
  async ({ event, step }) => {
    // v3 only type-checks event data; validate at runtime so bad input fails fast instead of retrying.
    const parsed = movieWatchedData.safeParse(event.data);
    if (!parsed.success) {
      throw new NonRetriableError(`Invalid event: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    }
    const { movie_title, recipient_email } = parsed.data;

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
