import { describe, expect, it, vi } from "vitest";
import { buildMovieEmail, sendMovieEmail } from "@/lib/email";

const movie = { title: "Tom & Jerry", year: "2021", plot: "<script>alert(1)</script> Cat chases mouse." };

function client(result: unknown) {
  const send = vi.fn().mockResolvedValue(result);
  return { send, client: { emails: { send } } as never };
}

describe("buildMovieEmail", () => {
  it("escapes external content in HTML but keeps plain text readable", () => {
    const { html, text, subject } = buildMovieEmail(movie);
    expect(html).not.toContain("<script>");
    expect(html).toContain("Tom &amp; Jerry");
    expect(text).toContain("<script>alert(1)</script>");
    expect(subject).toContain("Tom & Jerry (2021)");
  });
});

describe("sendMovieEmail", () => {
  const base = { to: "a@b.co", movie, idempotencyKey: "k1", from: "Me <me@x.co>" };

  it("passes the idempotency key to Resend and returns the id", async () => {
    const { send, client: c } = client({ data: { id: "em_1" }, error: null });
    await expect(sendMovieEmail({ ...base, client: c })).resolves.toEqual({ id: "em_1" });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "a@b.co", from: "Me <me@x.co>" }), { idempotencyKey: "k1" });
  });

  it.each([
    [422, false],
    [403, false],
    [429, true],
    [409, true],
    [500, true],
    [null, true],
  ])("maps Resend status %s to retriable=%s", async (statusCode, retriable) => {
    const { client: c } = client({ data: null, error: { name: "x", message: "m", statusCode } });
    const err = await sendMovieEmail({ ...base, client: c }).catch((e) => e);
    expect(err.retriable).toBe(retriable);
  });
});
