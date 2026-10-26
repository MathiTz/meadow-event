"use client";

import { useEffect, useState, useTransition } from "react";
import { sendMovieWatched } from "@/app/actions";

type Run = { status: string; runId?: string; output?: { message?: string } | string };

const TERMINAL = ["Completed", "Failed", "Cancelled"];
const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900";

export function Demo() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [eventId, setEventId] = useState<string>();
  const [run, setRun] = useState<Run>();
  const [recipient, setRecipient] = useState("");

  // Poll the run until it reaches a terminal state.
  useEffect(() => {
    if (!eventId) return;
    let stop = false;
    const tick = async () => {
      const r: Run = await fetch(`/api/runs/${eventId}`).then((res) => res.json());
      if (stop) return;
      setRun(r);
      if (!TERMINAL.includes(r.status)) setTimeout(tick, 1000);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [eventId]);

  function onSubmit(formData: FormData) {
    setError(undefined);
    setRecipient(String(formData.get("recipient_email") ?? ""));
    setRun(undefined);
    setEventId(undefined);
    startTransition(async () => {
      const res = await sendMovieWatched(formData);
      if (res.ok) setEventId(res.eventId);
      else setError(res.error);
    });
  }

  const status = run?.status;
  const done = status === "Completed";
  const failed = status === "Failed" || status === "Cancelled";
  const out = typeof run?.output === "object" ? run.output : undefined;

  const stages = [
    { label: "Event sent to Inngest", state: eventId ? "done" : "idle" },
    { label: "Run: fetch plot from OMDb, then send via Resend", state: !eventId ? "idle" : done ? "done" : failed ? "failed" : "active" },
    { label: done ? `Email delivered to ${recipient}` : failed ? "Run failed after retries" : "Email delivered", state: done ? "done" : failed ? "failed" : "idle" },
  ];

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <form action={onSubmit} className="space-y-4">
        <label className="block space-y-1 text-sm font-medium">
          Movie title
          <input name="movie_title" defaultValue="The Matrix" required className={inputCls} />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          Recipient email
          <input name="recipient_email" type="email" required placeholder="you@example.com" className={inputCls} />
        </label>
        <button
          disabled={pending}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send movie.watched event"}
        </button>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </form>

      <ol aria-live="polite" className="space-y-3">
        {stages.map((s) => (
          <li key={s.label} className="flex items-start gap-3 text-sm">
            <span
              aria-hidden
              className={
                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs text-white " +
                (s.state === "done" ? "bg-emerald-600" : s.state === "failed" ? "bg-red-600" : s.state === "active" ? "animate-pulse bg-amber-500" : "bg-zinc-300 dark:bg-zinc-700")
              }
            >
              {s.state === "done" ? "✓" : s.state === "failed" ? "!" : ""}
            </span>
            <span className={s.state === "idle" ? "text-zinc-400" : ""}>
              {s.label}
              <span className="sr-only"> ({s.state})</span>
            </span>
          </li>
        ))}
        {run?.runId && (
          <li className="pl-8 text-xs text-zinc-500">
            Run <code>{run.runId}</code>
            {process.env.NODE_ENV !== "production" && (
              <>
                {" · "}
                <a className="underline" target="_blank" rel="noreferrer" href={`http://localhost:8288/runs/${run.runId}`}>
                  open trace in Inngest
                </a>
              </>
            )}
          </li>
        )}
        {failed && out?.message && <li className="pl-8 text-xs text-red-600">{out.message}</li>}
      </ol>
    </div>
  );
}
