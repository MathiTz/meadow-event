import { render } from "@react-email/render";
import { Resend } from "resend";
import { MovieNotFoundEmail, notFoundMessage } from "@/emails/movie-not-found";
import { MovieRecapEmail, movieHeading, movieMeta } from "@/emails/movie-recap";
import { ServiceError } from "./errors";
import type { Movie } from "./omdb";

export async function buildMovieEmail(movie: Movie) {
  const element = <MovieRecapEmail movie={movie} />;
  const text = [movieHeading(movie), ...movieMeta(movie), "", movie.plot].join("\n");
  return { subject: `Your movie recap: ${movieHeading(movie)}`, html: await render(element), text };
}

export async function buildNotFoundEmail(title: string) {
  return {
    subject: `We couldn't find "${title}"`,
    html: await render(<MovieNotFoundEmail title={title} />),
    text: notFoundMessage(title),
  };
}

type SendArgs = {
  to: string;
  /** A found movie, or `{ notFoundTitle }` to send the friendly "not found" message. */
  movie: Movie | { notFoundTitle: string };
  /** Same key => Resend sends at most one email, even if Inngest retries the step. */
  idempotencyKey: string;
  from?: string;
  client?: Pick<Resend, "emails">;
};

export async function sendMovieEmail({
  to,
  movie,
  idempotencyKey,
  from = process.env.RESEND_FROM,
  client,
}: SendArgs): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!client && !apiKey) throw new ServiceError("RESEND_API_KEY is not configured", false);
  if (!from) throw new ServiceError("RESEND_FROM is not configured", false);

  const resend = client ?? new Resend(apiKey);
  const { subject, html, text } = "notFoundTitle" in movie ? await buildNotFoundEmail(movie.notFoundTitle) : await buildMovieEmail(movie);

  // The SDK resolves with { data, error } rather than throwing for API errors.
  const { data, error } = await resend.emails.send({ from, to, subject, html, text }, { idempotencyKey });

  if (error || !data) {
    const status = error?.statusCode ?? null;
    // No status (network) / 429 / 409 (concurrent idempotent request) / 5xx are worth another attempt.
    const retriable = status === null || status === 429 || status === 409 || status >= 500;
    throw new ServiceError(`Resend: ${error?.name ?? "unknown"} - ${error?.message ?? "no data returned"}`, retriable);
  }
  return { id: data.id };
}
