import OpenAI from "openai";

let client: OpenAI | null = null;

/**
 * Resolve a usable OpenAI API key. OpenAI keys always begin with "sk-", so we
 * skip any value that doesn't (e.g. a placeholder secret), and fall back to an
 * alternate env var name. This makes key configuration resilient to a stale or
 * malformed `OPENAI_API_KEY` secret that can't be edited from the agent.
 */
function resolveApiKey(): string | undefined {
  const candidates = [
    process.env.OPENAI_API_KEY,
    process.env.OPENAI_API_KEY_VALUE,
  ];
  return candidates
    .map((k) => (typeof k === "string" ? k.trim() : k))
    .find((k): k is string => !!k && k.startsWith("sk-"));
}

/**
 * Lazily construct the OpenAI client. Returns null when no valid API key is
 * configured so the server can still boot and other routes keep working —
 * only the AI feature degrades gracefully.
 */
export function getOpenAI(): OpenAI | null {
  if (client) return client;
  const apiKey = resolveApiKey();
  if (!apiKey) return null;
  client = new OpenAI({ apiKey });
  return client;
}
