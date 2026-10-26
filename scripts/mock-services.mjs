// Local stand-ins for OMDb and Resend so e2e runs are deterministic and send no real email.
// Behaviour is keyed on the movie title; see fixtures/events/*.json.
import http from "node:http";

const PORT = Number(process.env.MOCK_PORT || 4010);
const MATRIX = {
  Response: "True", Title: "The Matrix", Year: "1999", Director: "Lana Wachowski, Lilly Wachowski", imdbRating: "8.7", imdbID: "tt0133093",
  Plot: "Neo, a hacker, discovers reality is a simulation and joins the rebellion against the machines.",
};
const films = {
  "the matrix": MATRIX,
  "no plot movie": { ...MATRIX, Title: "No Plot Movie", Year: "2024", Plot: "N/A" },
  "flaky film": { ...MATRIX, Title: "Flaky Film", Year: "2020" },
};

const sent = new Map(); // idempotency key -> email
const attempts = new Map(); // idempotency key -> number of POSTs received

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/") {
      if (!url.searchParams.get("apikey")) return json(res, 401, { Response: "False", Error: "No API key provided." });
      const film = films[(url.searchParams.get("t") || "").toLowerCase()];
      return json(res, 200, film ?? { Response: "False", Error: "Movie not found!" });
    }

    if (req.method === "POST" && url.pathname === "/emails") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      const key = req.headers["idempotency-key"] || `no-key-${Math.random()}`;
      const n = (attempts.get(key) ?? 0) + 1;
      attempts.set(key, n);
      if (sent.has(key)) return json(res, 200, { id: sent.get(key).id }); // idempotent replay
      if (String(body.subject).includes("Flaky Film") && n <= 1) {
        return json(res, 500, { name: "internal_server_error", message: "Simulated Resend outage", statusCode: 500 });
      }
      const email = { id: `mock_${sent.size + 1}`, to: body.to, subject: body.subject, text: body.text, html: body.html };
      sent.set(key, email);
      return json(res, 200, { id: email.id });
    }

    if (url.pathname === "/__sent") return json(res, 200, { emails: [...sent.values()], attempts: Object.fromEntries(attempts) });
    if (url.pathname === "/__reset") {
      sent.clear();
      attempts.clear();
      return json(res, 200, { ok: true });
    }
    json(res, 404, { error: "not found" });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`mock OMDb + Resend on :${PORT}`));
