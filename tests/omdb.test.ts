import { describe, expect, it } from "vitest";
import { fetchMovie, NO_PLOT } from "@/lib/omdb";
import { MovieNotFoundError, ServiceError } from "@/lib/errors";

const json = (body: unknown, init?: ResponseInit) => async () => new Response(JSON.stringify(body), init);
const found = { Response: "True", Title: "The Matrix", Year: "1999", Plot: "A hacker learns the truth.", imdbRating: "8.7" };

describe("fetchMovie", () => {
  it("returns a normalised movie", async () => {
    const movie = await fetchMovie("The Matrix", "k", json(found));
    expect(movie).toMatchObject({ title: "The Matrix", year: "1999", plot: "A hacker learns the truth.", rating: "8.7" });
  });

  it("falls back when OMDb has no plot", async () => {
    const movie = await fetchMovie("X", "k", json({ ...found, Plot: "N/A" }));
    expect(movie.plot).toBe(NO_PLOT);
    expect(NO_PLOT).toMatch(/couldn't find a plot summary/);
  });

  it("treats 200 + Response:False (not found) as a MovieNotFoundError, never retried", async () => {
    const err = await fetchMovie("zzz", "k", json({ Response: "False", Error: "Movie not found!" })).catch((e) => e);
    expect(err).toBeInstanceOf(MovieNotFoundError);
    expect(err).toBeInstanceOf(ServiceError);
    expect(err.title).toBe("zzz");
    expect(err.retriable).toBe(false);
  });

  it("treats the daily request limit as retriable with a delay", async () => {
    const err = await fetchMovie("x", "k", json({ Response: "False", Error: "Request limit reached!" })).catch((e) => e);
    expect(err.retriable).toBe(true);
    expect(err.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("does not retry a rejected API key", async () => {
    const err = await fetchMovie("x", "bad", json({}, { status: 401 })).catch((e) => e);
    expect(err.retriable).toBe(false);
  });

  it("retries 5xx and honours Retry-After on 429", async () => {
    const e500 = await fetchMovie("x", "k", json({}, { status: 503 })).catch((e) => e);
    expect(e500.retriable).toBe(true);
    const e429 = await fetchMovie("x", "k", json({}, { status: 429, headers: { "retry-after": "30" } })).catch((e) => e);
    expect(e429).toMatchObject({ retriable: true, retryAfterSeconds: 30 });
  });

  it("retries network failures", async () => {
    const err = await fetchMovie("x", "k", async () => { throw new TypeError("fetch failed"); }).catch((e) => e);
    expect(err.retriable).toBe(true);
  });

  it("fails fast without an API key", async () => {
    const err = await fetchMovie("x", "").catch((e) => e);
    expect(err.retriable).toBe(false);
  });
});
