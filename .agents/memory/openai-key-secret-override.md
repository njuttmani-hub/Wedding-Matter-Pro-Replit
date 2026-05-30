---
name: OpenAI key secret override + defensive resolution
description: Why a stale OPENAI_API_KEY secret can poison the app and how to make key resolution resilient
---

# OPENAI_API_KEY secret override trap

A **secret** named `OPENAI_API_KEY` takes precedence over a **shared environment
variable** of the same name at runtime. If the secret holds a junk value (a user
once saved the literal string `Allow`), every request fails `401 Incorrect API
key provided: Allow` no matter what you set via `setEnvVars`.

**Agent limitations (confirmed):**
- The agent CANNOT create, edit, or delete *secrets* — only the user can, from the
  Secrets panel. `requestEnvVar` does NOT overwrite an already-existing secret.
- `deleteEnvVars` only removes shared/env vars, never secrets.
- `setEnvVars` writes shared env vars, which lose to a same-named secret.

**Why:** non-technical users may type a word like "Allow" into the secret value
box (or into chat), leaving a permanently-broken secret the agent can't fix.

**How to apply:** make key resolution defensive instead of fighting the secret.
In `artifacts/api-server/src/lib/openai.ts`, `resolveApiKey()` picks the first
candidate that starts with `sk-`, checking `OPENAI_API_KEY` then a fallback name
`OPENAI_API_KEY_VALUE`. Set the real key under the fallback name via `setEnvVars`
when the canonical secret is poisoned. A non-`sk-` value (like `Allow`) is simply
skipped.

**Note:** a valid key that returns `429 insufficient_quota` is an account-billing
problem (no credits), NOT a code/config problem — surface it to the user.
