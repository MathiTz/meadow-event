# Meadow · `movie.watched` Inngest function

> **Branches:** `main` / `v4` use the Inngest TypeScript SDK **v4**; `v3` (this branch) is the same app on SDK **v3**.
> The differences are small: v3 takes the trigger as a second argument to `createFunction`, types events with `EventSchemas().fromRecord`, and has no runtime event validation, so the handler validates with Zod (`NonRetriableError` on bad input).

An [Inngest](https://www.inngest.com/) function that reacts to `meadow_api/movie.watched`, looks the movie up on [OMDb](https://www.omdbapi.com/), and emails the plot to the recipient with [Resend](https://resend.com/).

Built with Next.js (App Router) + TypeScript. Inngest is served from a route handler (`/api/inngest`). A small demo page sends the event and shows the run progressing.

## How it works

```mermaid
sequenceDiagram
    autonumber
    participant C as Caller (UI / API)
    participant I as Inngest
    participant F as Next.js /api/inngest
    participant O as OMDb API
    participant R as Resend API

    C->>I: send meadow_api/movie.watched<br/>{movie_title, recipient_email}
    I->>F: invoke function (validate event with Zod)
    Note over F: step "fetch-movie"
    F->>O: GET /?t=title&plot=full
    alt movie found
        O-->>F: 200 {Response: "True", Plot, ...}
    else not found
        O-->>F: 200 {Response: "False", Error: "Movie not found!"}
        Note over F: step returns {movie: null}, so we email a friendly "not found" message instead of failing
    else bad API key
        O-->>F: 401
        F-->>I: NonRetriableError, run fails fast
    else 5xx / timeout / 429
        O-->>F: error
        F-->>I: throw, Inngest retries with backoff (RetryAfterError on 429)
    end
    I->>F: result memoized, run next step
    Note over F: step "send-email" (plot email, or "not found" email)
    F->>R: POST /emails (Idempotency-Key = event id)
    alt accepted
        R-->>F: {id}
        F-->>I: run Completed
    else 4xx validation / auth
        R-->>F: error
        F-->>I: NonRetriableError
    else 429 / 5xx / network
        R-->>F: error
        F-->>I: throw, retry (OMDb step is NOT re-run)
    end
    opt retries exhausted or non-retriable
        I->>F: onFailure handler
        F->>I: emit meadow_api/movie.recap.failed
    end
```

## Reliability choices ("maximise the chances the email is sent")

| Concern | Choice |
|---|---|
| Transient failures | `retries: 5` (6 attempts, exponential backoff) |
| Re-doing finished work | OMDb and Resend are separate `step.run`s, so a failed email never re-queries OMDb (results are memoized) |
| Duplicate emails | Resend `Idempotency-Key` = Inngest event id: a retry after an ambiguous timeout cannot send twice |
| Retrying the unretriable | Bad keys, invalid recipient, missing config throw `NonRetriableError`, which fails immediately instead of burning retries |
| Rate limits | `throttle: 2/s` matches Resend's default limit; `RetryAfterError` honours `Retry-After` on 429 |
| OMDb quirk | OMDb returns **HTTP 200** with `Response:"False"` for not found, so the body is parsed with Zod (a discriminated union) |
| Hung upstreams | 8s `AbortSignal.timeout` on the OMDb call |
| Unknown title | Not an error: the recipient gets a friendly "we couldn't find *X*" email and the run completes |
| Empty plot | OMDb's `"N/A"` becomes a friendly fallback sentence inside the normal email |
| Injection | Plot/title are HTML-escaped; a plain-text part is included too |
| Visibility | `onFailure` emits `meadow_api/movie.recap.failed` (hook for alerting or a dead-letter queue) |
| Bad input | The handler validates the event with Zod (`src/inngest/schemas.ts`); empty titles / invalid emails throw `NonRetriableError` |

## Setup

Requires Node 20+.

```bash
npm install
cp .env.example .env.local   # then fill in OMDB_API_KEY, RESEND_API_KEY, RESEND_FROM
echo "INNGEST_DEV=1" >> .env.local
```

Run the app and the Inngest dev server in two terminals:

```bash
npm run dev
```

```bash
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

- Demo page: <http://localhost:3000>. Fill the form to send the event and watch the stages.
- Inngest dashboard: <http://localhost:8288> (per-step trace, retries, payloads).
- Or send the raw event:

```bash
curl -X POST http://localhost:8288/e/test -H 'content-type: application/json' \
  -d '{"name":"meadow_api/movie.watched","data":{"movie_title":"The Matrix","recipient_email":"you@example.com"}}'
```

### Tests

```bash
npm test      # unit: OMDb parsing, Resend error mapping, escaping, edge-case emails
npm run e2e   # end-to-end against fixtures (below)
```

### Fixture events and e2e

`fixtures/events/*.json` are replayable `movie.watched` events, each with the outcome it must produce:

| Fixture | Proves |
|---|---|
| `matrix` | Happy path (the exact event from the exercise): plot email sent |
| `not-found` | Unknown title: run completes, recipient gets a "not found" email |
| `no-plot` | OMDb `Plot: "N/A"`: email sent with a friendly fallback message |
| `flaky-resend` | Resend 500 once: Inngest retries, exactly one email delivered |
| `invalid-email` | Malformed recipient: run fails fast, nothing sent |

`npm run e2e` starts a local mock of OMDb + Resend (`scripts/mock-services.mjs`, via `OMDB_BASE_URL` / `RESEND_BASE_URL`), Next.js on :3100 and the Inngest dev server on :8288, replays each fixture, and asserts the run status and the emails the mock received. No real keys or real emails are involved. Run one fixture with `npm run e2e -- matrix`. You can also replay a fixture against your real keys:

```bash
curl -X POST http://localhost:8288/e/test -H 'content-type: application/json' \
  -d "$(node -p "JSON.stringify(require('./fixtures/events/matrix.json').event)")"
```

### Production
Set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` (from the Inngest dashboard), deploy, and sync the app URL `https://<host>/api/inngest`. Set `RESEND_FROM` to an address on a domain verified in Resend.

## Layout
```
src/inngest/client.ts                  client + typed, Zod-validated event definitions
src/inngest/functions/movie-watched.ts the function (steps, retry mapping, flow control)
src/inngest/schemas.ts                 Zod event schema shared by function, UI and tests
src/lib/omdb.ts                        OMDb client -> typed ServiceError(retriable)
src/lib/email.ts                       Resend wrapper + email template
src/app/api/inngest/route.ts           Inngest serve handler
src/app/actions.ts, components/demo.tsx demo form (server action) with run-status polling
tests/                                 Vitest unit tests
fixtures/events/                       replayable events + expected outcomes
scripts/                               mock OMDb/Resend + e2e runner
```

## Assumptions
- **Inngest SDK v3** (`inngest@^3`): trigger is the second argument of `createFunction`. See the `v4` branch for the current SDK.
- `movie_title` is passed to OMDb's `t=` (exact-title lookup, `type=movie`, full plot). Ambiguous titles resolve to whatever OMDb ranks first.
- An unknown title is treated as an expected outcome (the user typed something we can't find), so they get an explanatory email rather than silence.
- Email content is the plot plus title/year/director/rating when available; the exercise only required the plot.
- Resend without a verified domain can only send from `onboarding@resend.dev` **to the Resend account owner's address**. Testing used that address. `RESEND_FROM` is configurable for real use.
- No persistence: the Inngest run history is the record of what was sent.

## Recommendations for improving this exercise
1. **Provide a ready sandbox**: a verified Resend sender/domain or a documented test inbox, plus a shared OMDb key. Candidates otherwise lose time on the Resend "only send to yourself" restriction, which says nothing about their skill.
2. **Specify edge-case expectations**: what should happen for "movie not found", ambiguous titles, or `Plot: "N/A"`? Today every candidate invents different behaviour, which makes submissions hard to compare.
3. **Ship fixture events and a mock OMDb/Resend** (like `fixtures/` and `scripts/` here) so reviewers can run every submission against the same inputs, including failure injection.
4. **State the Inngest SDK version**, since v3 and v4 differ in how functions and triggers are declared (this repo has a branch for each).
