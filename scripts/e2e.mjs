// End-to-end: boots mock OMDb/Resend + Next + Inngest dev server, replays every fixture event and asserts the outcome.
// Usage: npm run e2e   (add `-- matrix` to run only fixtures whose filename contains "matrix")
import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";

const NEXT_PORT = 3100;
const INNGEST = "http://127.0.0.1:8288";
const MOCK = "http://127.0.0.1:4010";
const only = process.argv[2];

const env = {
  ...process.env,
  INNGEST_DEV: "1",
  OMDB_API_KEY: "mock-omdb-key",
  OMDB_BASE_URL: MOCK,
  RESEND_API_KEY: "re_mock",
  RESEND_BASE_URL: MOCK,
  RESEND_FROM: "Meadow <test@example.com>",
};

const children = [];
const start = (cmd, args) => {
  const c = spawn(cmd, args, { env, stdio: "ignore", detached: false });
  children.push(c);
  return c;
};
const stopAll = () => children.forEach((c) => c.kill("SIGTERM"));
process.on("exit", stopAll);
process.on("SIGINT", () => process.exit(130));

async function waitFor(url, label, ms = 90_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${label} did not start (${url})`);
}

const get = (url) => fetch(url).then((r) => r.json());

async function pollRun(eventId, timeoutMs = 90_000) {
  const t0 = Date.now();
  let runId;
  while (Date.now() - t0 < timeoutMs) {
    // The per-event listing can report "Failed" between retry attempts, so find the run, then poll the run itself.
    runId ??= (await get(`${INNGEST}/v1/events/${eventId}/runs`)).data?.[0]?.run_id;
    const run = runId && (await get(`${INNGEST}/v1/runs/${runId}`)).data;
    if (run && ["Completed", "Failed", "Cancelled"].includes(run.status)) return run;
    await new Promise((r) => setTimeout(r, 500));
  }
  return { status: "Timeout" };
}

async function main() {
  start("node", ["scripts/mock-services.mjs"]);
  start("npx", ["next", "dev", "-p", String(NEXT_PORT)]);
  start("npx", ["--yes", "inngest-cli@latest", "dev", "-u", `http://localhost:${NEXT_PORT}/api/inngest`, "--no-discovery"]);
  await waitFor(`${MOCK}/__sent`, "mock services");
  await waitFor(`http://localhost:${NEXT_PORT}/api/inngest`, "Next.js");
  await waitFor(INNGEST, "Inngest dev server");
  // Warm up so the first fixture doesn't pay the compile cost inside its timeout.
  await fetch(`http://localhost:${NEXT_PORT}/`).catch(() => {});

  const files = readdirSync("fixtures/events").filter((f) => f.endsWith(".json") && (!only || f.includes(only)));
  let failures = 0;

  for (const file of files) {
    const fx = JSON.parse(readFileSync(`fixtures/events/${file}`, "utf8"));
    await get(`${MOCK}/__reset`);
    const { ids } = await fetch(`${INNGEST}/e/test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fx.event),
    }).then((r) => r.json());
    const run = await pollRun(ids[0]);
    const { emails, attempts } = await get(`${MOCK}/__sent`);

    const problems = [];
    const ex = fx.expect;
    if (run.status !== ex.runStatus) problems.push(`run status ${run.status}, expected ${ex.runStatus}${run.output?.message ? ` (${run.output.message})` : ""}`);
    if (emails.length !== ex.emails) problems.push(`${emails.length} email(s) sent, expected ${ex.emails}`);
    const e = emails[0];
    if (ex.subjectIncludes && !e?.subject.includes(ex.subjectIncludes)) problems.push(`subject "${e?.subject}" lacks "${ex.subjectIncludes}"`);
    if (ex.bodyIncludes && !(e?.text ?? "").includes(ex.bodyIncludes)) problems.push(`body lacks "${ex.bodyIncludes}"`);
    if (ex.resendAttempts && Object.values(attempts)[0] !== ex.resendAttempts) problems.push(`Resend saw ${Object.values(attempts)[0]} attempts, expected ${ex.resendAttempts}`);

    console.log(`${problems.length ? "✗" : "✓"} ${file.replace(".json", "")}: ${fx.description}`);
    problems.forEach((p) => console.log(`    - ${p}`));
    failures += problems.length ? 1 : 0;
  }

  console.log(`\n${files.length - failures}/${files.length} fixtures passed`);
  return failures;
}

main()
  .then((f) => process.exit(f ? 1 : 0))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
