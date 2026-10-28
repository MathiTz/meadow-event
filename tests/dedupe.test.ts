import { describe, expect, it } from "vitest";
import { DEDUPE_WINDOW_MS, watchEventId } from "@/lib/dedupe";
import { createLimiter } from "@/lib/rate-limit";

describe("watchEventId", () => {
  const data = { movie_title: "The Matrix", recipient_email: "ann@x.com" };
  const t0 = 1_700_000_000_000;

  it("is the same for the same recipient and movie inside one window", () => {
    expect(watchEventId(data, t0)).toBe(watchEventId({ ...data }, t0 + 1_000));
  });

  it("ignores case and surrounding spaces in title and email", () => {
    expect(watchEventId({ movie_title: " the matrix ", recipient_email: "ANN@x.com" }, t0)).toBe(watchEventId(data, t0));
  });

  it("differs per movie, per recipient, and across windows (a deliberate rewatch later still works)", () => {
    const base = watchEventId(data, t0);
    expect(watchEventId({ ...data, movie_title: "Heat" }, t0)).not.toBe(base);
    expect(watchEventId({ ...data, recipient_email: "bob@x.com" }, t0)).not.toBe(base);
    expect(watchEventId(data, t0 + 2 * DEDUPE_WINDOW_MS)).not.toBe(base);
  });
});

describe("createLimiter", () => {
  it("allows up to the limit, then reports how long to wait", () => {
    const l = createLimiter({ limit: 2, windowMs: 60_000 });
    expect(l.check("ip", 0).ok).toBe(true);
    expect(l.check("ip", 1_000).ok).toBe(true);
    const third = l.check("ip", 10_000);
    expect(third).toEqual({ ok: false, retryAfterSeconds: 50 });
  });

  it("counts clients separately and frees the window as time passes", () => {
    const l = createLimiter({ limit: 1, windowMs: 60_000 });
    expect(l.check("a", 0).ok).toBe(true);
    expect(l.check("b", 0).ok).toBe(true);
    expect(l.check("a", 30_000).ok).toBe(false);
    expect(l.check("a", 60_001).ok).toBe(true);
  });
});
