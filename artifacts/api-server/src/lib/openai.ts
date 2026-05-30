import OpenAI from "openai";

let client: OpenAI | null = null;

/**
 * Lazily construct the OpenAI client. Returns null when no API key is
 * configured so the server can still boot and other routes keep working —
 * only the AI feature degrades gracefully.
 */
export function getOpenAI(): OpenAI | null {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  client = new OpenAI({ apiKey });
  return client;
}
