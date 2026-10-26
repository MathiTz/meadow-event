import { Resend } from "resend";
import { ServiceError } from "./errors";
import type { Movie } from "./omdb";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function buildMovieEmail(movie: Movie) {
  const heading = movie.year ? `${movie.title} (${movie.year})` : movie.title;
  const meta = [
    movie.director && `Directed by ${movie.director}`,
    movie.rating && `IMDb ${movie.rating}/10`,
  ].filter(Boolean) as string[];

  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;line-height:1.6;color:#1f2937">
<h1 style="font-size:22px;margin:0 0 4px">${escapeHtml(heading)}</h1>
${meta.length ? `<p style="margin:0 0 16px;color:#6b7280">${escapeHtml(meta.join(" · "))}</p>` : ""}
<p>${escapeHtml(movie.plot)}</p>
<p style="color:#9ca3af;font-size:12px;margin-top:24px">You received this because you watched ${escapeHtml(movie.title)}.</p>
</div>`;

  const text = [heading, ...meta, "", movie.plot].join("\n");
  return { subject: `Your movie recap: ${heading}`, html, text };
}

type SendArgs = {
  to: string;
  movie: Movie;
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
  const { subject, html, text } = buildMovieEmail(movie);

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
