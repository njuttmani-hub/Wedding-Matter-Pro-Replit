import { Router, type IRouter } from "express";
import { ExtractMatterBody, ExtractMatterResponse } from "@workspace/api-zod";
import { getOpenAI } from "../lib/openai";

const router: IRouter = Router();

// Lightweight in-memory rate limiter to curb abuse of the paid vision endpoint.
const RATE_LIMIT = 10; // requests
const RATE_WINDOW_MS = 60_000; // per minute, per IP
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT;
}

const SYSTEM_PROMPT = `You are an expert assistant for an Indian wedding invitation studio.
You are given photos of a hand-filled physical enquiry form and one or more card design pages.
Each design page has a "command" note from the customer describing which content (matter) belongs on that page.

Your job: read ALL the photos carefully (handwriting may be in English, Hindi, Marathi, or Gujarati)
and extract the structured wedding card "matter". Use the design-page commands to understand how the
matter should be arranged, and summarize that arrangement in "designNotes".

Rules:
- Transcribe names and text exactly as written, preserving the original script where possible.
- If a field is not present in the photos, return an empty string "" (or empty array) for it. Never invent data.
- "relationWord" is the word joining the couple (e.g. "weds", "विवाह", "लग्न"). Default to "weds" if unclear.
- "programmes" are the dated events (wedding, reception, mehendi, haldi, etc.). Include each event you can find.
- "language" is the dominant script of the matter: one of "English", "Hindi", "Marathi", "Gujarati".
- Respond with ONLY a JSON object matching the requested schema. No prose, no markdown.`;

const JSON_SHAPE = `{
  "brideName": string,
  "groomName": string,
  "bride": { "name": string, "fatherName": string, "motherName": string, "grandfatherName": string, "grandmotherName": string },
  "groom": { "name": string, "fatherName": string, "motherName": string, "grandfatherName": string, "grandmotherName": string },
  "familyTitle": string,
  "nativePlace": string,
  "residenceAddress": string,
  "deities": string[],
  "relationWord": string,
  "invitationText": string,
  "programmes": [ { "name": string, "date": string, "time": string, "venue": string, "address": string } ],
  "designNotes": string,
  "language": string
}`;

router.post("/wedding/extract-matter", async (req, res): Promise<void> => {
  const openai = getOpenAI();
  if (!openai) {
    req.log.error("OPENAI_API_KEY not configured");
    res
      .status(503)
      .json({ error: "Photo reading is not available right now. Please submit and our designer will type your matter." });
    return;
  }

  const ip = req.ip ?? "unknown";
  if (rateLimited(ip)) {
    res
      .status(429)
      .json({ error: "Too many requests. Please wait a minute and try again." });
    return;
  }

  const parsed = ExtractMatterBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid extract-matter body");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { formPhotos, designPages } = parsed.data;

  if (formPhotos.length === 0 && designPages.length === 0) {
    res
      .status(400)
      .json({ error: "Provide at least one form photo or design page." });
    return;
  }

  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [];

  content.push({
    type: "text",
    text: `Extract the wedding card matter from the following images.\nReturn JSON exactly matching this shape:\n${JSON_SHAPE}`,
  });

  formPhotos.forEach((url, i) => {
    content.push({ type: "text", text: `Filled form photo #${i + 1}:` });
    content.push({ type: "image_url", image_url: { url } });
  });

  designPages.forEach((page, i) => {
    content.push({
      type: "text",
      text: `Design page #${i + 1} — customer command: "${page.command || "(none)"}"`,
    });
    content.push({ type: "image_url", image_url: { url: page.image } });
  });

  let raw: string;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content },
      ],
    });
    raw = completion.choices[0]?.message?.content ?? "";
  } catch (err) {
    req.log.error({ err }, "OpenAI vision request failed");
    res
      .status(502)
      .json({ error: "Could not read the photos. Please try again." });
    return;
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    req.log.error({ raw }, "OpenAI returned non-JSON");
    res
      .status(502)
      .json({ error: "Could not understand the photos. Please try clearer images." });
    return;
  }

  const result = ExtractMatterResponse.safeParse(json);
  if (!result.success) {
    req.log.error(
      { errors: result.error.message },
      "Extracted matter failed schema validation",
    );
    res
      .status(502)
      .json({ error: "Extracted data was incomplete. Please try again." });
    return;
  }

  res.json(result.data);
});

export default router;
