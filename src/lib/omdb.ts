import { z } from "zod";
import { ServiceError } from "./errors";

const OMDB_URL = "https://www.omdbapi.com/";
const TIMEOUT_MS = 8_000;

// OMDb answers 200 for "not found" and flags it in the body, so we model both shapes.
const omdbBody = z.discriminatedUnion("Response", [
  z.object({
    Response: z.literal("True"),
    Title: z.string(),
    Year: z.string().optional(),
    Director: z.string().optional(),
    imdbRating: z.string().optional(),
    imdbID: z.string().optional(),
    Poster: z.string().optional(),
    Plot: z.string().optional(),
  }),
  z.object({ Response: z.literal("False"), Error: z.string().default("Unknown OMDb error") }),
]);

export type Movie = {
  title: string;
  year?: string;
  director?: string;
  rating?: string;
  imdbId?: string;
  poster?: string;
  plot: string;
};

export const NO_PLOT = "No plot summary is available for this movie.";

const clean = (v?: string) => (v && v !== "N/A" ? v : undefined);

export async function fetchMovie(
  title: string,
  apiKey: string | undefined = process.env.OMDB_API_KEY,
  fetchImpl: typeof fetch = fetch,
): Promise<Movie> {
  // Missing config will never fix itself between retries.
  if (!apiKey) throw new ServiceError("OMDB_API_KEY is not configured", false);

  const url = new URL(OMDB_URL);
  url.search = new URLSearchParams({ t: title, type: "movie", plot: "full", apikey: apiKey }).toString();

  let res: Response;
  try {
    res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    // Network failure or timeout: transient.
    throw new ServiceError(`OMDb request failed: ${(err as Error).message}`, true);
  }

  if (res.status === 401) throw new ServiceError("OMDb rejected the API key (401)", false);
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after"));
    throw new ServiceError("OMDb rate limit hit (429)", true, retryAfter > 0 ? retryAfter : undefined);
  }
  if (!res.ok) throw new ServiceError(`OMDb returned HTTP ${res.status}`, res.status >= 500);

  const parsed = omdbBody.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new ServiceError("OMDb returned an unexpected payload", true);

  const body = parsed.data;
  if (body.Response === "False") {
    // "Movie not found!" / "Invalid API key!" / "Request limit reached!"
    const limited = /limit/i.test(body.Error);
    throw new ServiceError(`OMDb: ${body.Error}`, limited, limited ? 3600 : undefined);
  }

  return {
    title: body.Title,
    year: clean(body.Year),
    director: clean(body.Director),
    rating: clean(body.imdbRating),
    imdbId: clean(body.imdbID),
    poster: clean(body.Poster),
    plot: clean(body.Plot) ?? NO_PLOT,
  };
}
