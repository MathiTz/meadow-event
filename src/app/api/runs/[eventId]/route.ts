import { NextResponse } from "next/server";

// Demo helper: asks the Inngest API which runs an event triggered and how they ended.
const base = () => (process.env.INNGEST_DEV ? "http://127.0.0.1:8288" : "https://api.inngest.com");

type Run = { run_id: string; status: string; output?: unknown };

const get = (path: string) =>
  fetch(`${base()}${path}`, {
    headers: process.env.INNGEST_SIGNING_KEY ? { Authorization: `Bearer ${process.env.INNGEST_SIGNING_KEY}` } : {},
    cache: "no-store",
  });

export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  try {
    const res = await get(`/v1/events/${encodeURIComponent(eventId)}/runs`);
    if (!res.ok) return NextResponse.json({ status: "Unknown" }, { status: 200 });
    const { data } = (await res.json()) as { data?: Run[] };
    const first = data?.[0];
    if (!first) return NextResponse.json({ status: "Queued" });
    // The per-event listing can say "Failed" between retry attempts; the run itself only reports a terminal state once retries are exhausted.
    const detail = await get(`/v1/runs/${first.run_id}`);
    const run = detail.ok ? ((await detail.json()) as { data?: Run }).data ?? first : first;
    return NextResponse.json({ runId: first.run_id, status: run.status, output: run.output });
  } catch {
    return NextResponse.json({ status: "Unknown" });
  }
}
