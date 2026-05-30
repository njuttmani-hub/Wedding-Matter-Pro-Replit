---
name: Lazy third-party SDK clients in api-server
description: Why server libs that build external SDK clients (OpenAI, etc.) must be lazy and tolerate a missing key.
---

# Lazy / non-fatal third-party clients

Server libraries that construct a third-party SDK client (OpenAI, Stripe, etc.) must do so **lazily inside a getter**, returning `null` (or throwing a handled error) when the key is missing — never throw at module top-level.

**Why:** A top-level `throw new Error("KEY must be set")` in a lib that is imported by a router runs at server boot. If the secret is missing or invalid-shaped, the *entire* API fails to start — including unrelated routes like `/healthz`. One optional feature should not take down the whole server.

**How to apply:** Expose `getClient()` that reads `process.env` at call time and caches the instance. In the route handler, if it returns null, respond `503` with a friendly "feature unavailable" message and continue serving everything else. See `artifacts/api-server/src/lib/openai.ts` + `routes/wedding.ts` for the pattern.
