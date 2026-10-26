import { NextResponse } from "next/server";

// Demo helper: asks the Inngest API which runs an event triggered and how they ended.
const base = () => (process.env.INNGEST_DEV ? "http://127.0.0.1:8288" : "https://api.inngest.com");

export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  try {
    const res = await fetch(`${base()}/v1/events/${encodeURIComponent(eventId)}/runs`, {
      headers: process.env.INNGEST_SIGNING_KEY ? { Authorization: `Bearer ${process.env.INNGEST_SIGNING_KEY}` } : {},
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ status: "Unknown" }, { status: 200 });
    const { data } = (await res.json()) as { data?: { run_id: string; status: string; output?: unknown }[] };
    const run = data?.[0];
    return NextResponse.json(run ? { runId: run.run_id, status: run.status, output: run.output } : { status: "Queued" });
  } catch {
    return NextResponse.json({ status: "Unknown" });
  }
}
