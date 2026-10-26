import { describe, expect, it, vi } from "vitest";
import { buildMovieEmail, buildNotFoundEmail, sendMovieEmail } from "@/lib/email";

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

describe("buildNotFoundEmail", () => {
  it("names the title (escaped) and suggests what to try", () => {
    const { subject, html, text } = buildNotFoundEmail('<b>Oops</b>');
    expect(subject).toContain("couldn't find");
    expect(html).not.toContain("<b>Oops</b>");
    expect(text).toContain("<b>Oops</b>");
    expect(text).toMatch(/spelling/);
  });
});

describe("sendMovieEmail", () => {
  const base = { to: "a@b.co", movie, idempotencyKey: "k1", from: "Me <me@x.co>" };

  it("passes the idempotency key to Resend and returns the id", async () => {
    const { send, client: c } = client({ data: { id: "em_1" }, error: null });
    await expect(sendMovieEmail({ ...base, client: c })).resolves.toEqual({ id: "em_1" });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "a@b.co", from: "Me <me@x.co>" }), { idempotencyKey: "k1" });
  });

  it("sends the not-found message when given notFoundTitle", async () => {
    const { send, client: c } = client({ data: { id: "em_2" }, error: null });
    await sendMovieEmail({ ...base, movie: { notFoundTitle: "Nope" }, client: c });
    expect(send.mock.calls[0][0].subject).toContain("Nope");
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
