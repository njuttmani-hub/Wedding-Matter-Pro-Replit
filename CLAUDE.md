# Wedding Matter Pro

Premium wedding invitation card studio — customers fill an 8-step wizard to select their card "matter" (content), and designers receive a structured CorelDRAW export. Built for a small wedding-card printing business (solo, non-technical owner) — every architectural choice here optimizes for the fewest moving parts to maintain, not for scale.

## Status (2026-09-06)

**The app is deployed on Vercel and confirmed working in production** — orders submit and the admin dashboard reads them against the live Supabase project. Earlier milestones (Supabase migration off `localStorage`, detaching from Replit) are done and described below.

- **Done:** Supabase project live (`lnbxqxgrgvmpndhcyuyj.supabase.co`), schema applied, admin user created (`j.p.papertradeconverters@gmail.com`). `create_order()` RPC and RLS lockout verified directly against the REST API — anon can create orders but can't read the table; admin can. All Replit config removed; local Node 24 + pnpm setup works on Windows. Deployed to Vercel from `main`, with the customer submit → admin login → see order flow confirmed on the live site.
- **Also landed since:** a full UI redesign (Midnight & Champagne palette, Inter + Playfair Display), a custom "write our own" kids message, past dates blocked on programme dates, Gmail sharing that sends the card PNGs and PDF along with the matter, and the font list grown from 20 to 55.
- **Not done yet:** no custom domain — the site is on its Vercel URL. Buying one and pointing it at Vercel is the remaining deployment step.
- **Action needed from the owner:** the deleted `.replit` file had two OpenAI API keys committed in plaintext, still readable in old git commits (a history rewrite was explicitly declined). Rotate them at platform.openai.com whenever you're back in that account — not urgent since nothing calls them currently.

### Deploying

Vercel builds from `main` — nothing reaches the live site until it is merged there. `VITE_*` variables are **inlined at build time**, not read at runtime, so `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` must exist in the Vercel project settings and a redeploy is required after changing them. If they are missing the build still succeeds and the site loads fine — it just silently has no database, so orders fail to submit and admin login fails.

## Run & Operate

Runs entirely locally now — no Replit shell needed.

- `pnpm install` — install/update dependencies (run from the repo root)
- `pnpm --filter @workspace/wedding-matter-pro run dev` — run the app (defaults to `http://localhost:5173`; override with `PORT`/`BASE_PATH` env vars if needed)
- `pnpm run typecheck` — full typecheck across all packages

Node.js 24 LTS and pnpm (via the standalone installer, not corepack — corepack needed admin rights this machine didn't have interactively) are installed under the current Windows user account. A fresh terminal should have `node`/`pnpm` on `PATH` automatically (the pnpm installer registered `PNPM_HOME` at the user level); if a shell somehow doesn't see them, open a new terminal window first before assuming something's broken.

## Setup (done for this project's Supabase project — steps below for a NEW environment, e.g. a second developer's machine or a from-scratch redo)

1. **Create a Supabase project** at supabase.com (free tier is enough for a small business). Note its Project URL and anon/public API key from *Project Settings → API*.
2. **Run the schema**: Supabase Dashboard → SQL Editor → paste the entire contents of `supabase/schema.sql` → Run. Safe to re-run if you need to.
3. **Create your admin login**: Dashboard → Authentication → Users → Add user. Use your own email + a password (Supabase never surfaces it again after creation — if forgotten, reset it from the user's row in the dashboard rather than trying to recover it). This is the only account that can see the Admin dashboard — there is no public sign-up.
4. **Set the env vars** — copy `artifacts/wedding-matter-pro/.env.example` to `.env` in that same folder and fill in the two values. Production hosting (Roadmap step 3) will need the same two vars set as its own env/secrets config.
5. Load the app, click **Admin**, sign in with the account from step 3.

This project's own Supabase instance is already fully set up — a fresh clone just needs its own `.env` (step 4) pointed at the existing project; steps 1–3 only apply when standing up a brand new Supabase project.

## Where things live

- `artifacts/wedding-matter-pro/src/WeddingApp.tsx` — entire app (all components), single file by design
- `artifacts/wedding-matter-pro/src/data/constants.ts` — all content data (templates, deities, fonts, etc.)
- `artifacts/wedding-matter-pro/src/types.ts` — TypeScript interfaces (`FormState`, `SubmittedOrder`, …)
- `artifacts/wedding-matter-pro/src/lib/supabase.ts` — the Supabase client (null if env vars missing — every caller handles that)
- `artifacts/wedding-matter-pro/src/lib/orders.ts` — all order CRUD + realtime subscription
- `artifacts/wedding-matter-pro/src/lib/auth.ts` — admin session/sign-in/sign-out
- `supabase/schema.sql` — the entire database: table, indexes, RLS policies, the `create_order()` function. Source of truth for the schema; there is no ORM/migration tool in front of it (see **Architecture decisions**).

## Architecture decisions

- **Supabase over a custom backend.** The previous `artifacts/api-server` (Express) + `lib/db` (empty Drizzle package) + `lib/api-zod`/`lib/api-client-react` (OpenAPI codegen pipeline) assumed a team maintaining a running server. For a solo non-technical owner, that's the wrong trade — Supabase gives hosted Postgres + auth + realtime with nothing to deploy or patch. Those old packages are still in the repo but are dead weight now; consider deleting them once this migration is confirmed working (double-check nothing outside them references `@workspace/api-zod`/`@workspace/db` first).
- **One table, `jsonb` for the form.** `orders.form` stores the entire `FormState` object as-is — matches what the wizard already builds, so no field-by-field schema/migration work was needed. Only `couple`, `status`, and timestamps are real columns, since those are what the dashboard filters/sorts by.
- **Orders are created only through a `SECURITY DEFINER` Postgres function (`create_order`), never a direct table insert.** Customers use the public anon key, which has *zero* table privileges — no select, no direct insert. This is stricter than a typical "anon can insert" RLS policy: it means a customer can't forge a `status: 'Completed'` order, can't read any order (including their own) after submitting, and the only data that flows back to their browser is the generated order number + timestamp. Admins (Supabase Auth session) get full select/update/delete via RLS.
- **`order_number` is a database identity column**, shown in the UI as `WMP-<n>`. This replaces the old client-side `Math.random()`-based ID, which had a real (if small) collision risk between two customers submitting in the same moment.
- **The in-progress wizard draft still lives in `localStorage`** (`wmp_draft_v3`) — only *submitted* orders live in Supabase. There's no reason to sync a half-filled form across devices, and keeping it local means the wizard still autosaves/restores instantly with no network dependency while a customer is filling it out.
- **Single large `WeddingApp.tsx`** keeps all UI components co-located for easy editing (pre-existing decision, kept as-is). Data-access code (`lib/supabase.ts`, `lib/orders.ts`, `lib/auth.ts`) was pulled into its own `lib/` folder since it isn't a UI component.
- Inline styles used for the card palette system (light/dark) to avoid CSS variable conflicts.
- Google Fonts loaded dynamically via DOM injection in a `useEffect` (avoids double-load).

## Product

- **Type mode only**: 8-step wizard (bride/groom details, deity, template, programmes, extras, typography) with live card preview + CorelDRAW export
- **Live card preview**: split into two pages — Page 1 (deities, template, names, address, compliments, kids, closing) and Page 2 (programmes); white background with black text for legibility
- **Reception meal type**: dinner or lunch selector for reception events, shown as "from X onwards (dinner/lunch)" on the card
- **Programme dates cannot be in the past**: `min` on the picker plus a re-check in the step gate, since `min` is only advisory for a typed or pasted value
- **Kids message**: a preset list plus a "write our own" option (`kidsCustom`) for naming the couple's own kids
- **CorelDRAW export**: structured plain-text block generated on submission, copyable by designer
- **Sharing**: WhatsApp and Gmail, both pre-filled with the full matter. The card travels too — a PNG per page and a PDF of both. On a phone the OS share sheet attaches them; on desktop they are downloaded for the user to attach, because a web page cannot attach a file to Gmail
- **Admin dashboard**: order listing with status badges, live-synced across devices; per-order modal shows card preview + export; gated behind Supabase Auth login
- **22 invitation templates** across 8 categories (Classic, Romantic, Daughter, Modern, Reception, etc.)
- **12 deities** with glyphs and mantras
- **55 Google Fonts** supporting English, Hindi, Marathi, Gujarati scripts

## Roadmap (small-business rebuild plan)

1. ~~Supabase schema + wire order storage + admin auth~~ ← done, live project, end-to-end tested
2. ~~Detach from Replit — local Node/pnpm setup, remove all Replit-specific config~~ ← done
3. ~~Deploy client + admin to Vercel~~ ← done, live and verified in production. Remaining piece: a purchased custom domain (Namecheap/Cloudflare) pointed at the Vercel deployment.
4. Decide on the orphaned AI photo-extraction feature (`artifacts/api-server`) — reconnect as a Supabase Edge Function calling OpenAI (with a freshly rotated key — see **Status**), or delete it, once the owner decides it's worth the API cost
5. Once deployment is confirmed solid, delete the now-unused `artifacts/api-server`, `lib/db`, `lib/api-zod`, `lib/api-client-react`, and `artifacts/mockup-sandbox` packages to actually shrink the stack

## Gotchas

- Do NOT rename `Palette` type in `src/types.ts` — it conflicts with the lucide icon of the same name (hence the alias `Palette as PaletteIcon` in `WeddingApp.tsx`)
- `orders.form` is trusted, unvalidated JSON on the way out of `create_order()` — it's whatever the wizard sent. Fine for a low-traffic business tool; would need a Zod check at the RPC boundary if this ever needs to resist adversarial input
- `pnpm-workspace.yaml`'s `overrides` section deliberately excludes native binaries for platforms nobody uses (keeps installs smaller) — it now assumes Windows x64 for local dev. If development ever moves to a Mac or Linux machine, that platform's entries need to come out of the `overrides` list the same way the `win32-x64` ones were removed here, or `pnpm install` will silently produce a lockfile missing that platform's binaries.
- `esbuild`'s postinstall build script and `pnpm-workspace.yaml`'s `allowBuilds: esbuild: true` need to stay in sync — pnpm blocks unapproved install scripts by default and `esbuild` needs its script to fetch the correct native binary.
- **`FONTS` in `data/constants.ts` and the Google Fonts `css2` URL in `WeddingApp.tsx` must stay in sync, and both fail silently.** A font added to `FONTS` but missing from the URL still appears in the picker and still renders — as the browser's default serif. Worse, asking that URL for a weight a family does not publish makes the whole request 400, which breaks *every* font on the page, not just the new one. Check each family against `https://fonts.googleapis.com/css2?family=<Name>:wght@...` before adding it, and verify in a browser with `document.fonts.check('16px "<Name>"')` rather than by eye.
- The card's two pages are found by the `.wmp-card-page` class, not by walking `children` — the export ref wraps `CardPreview`, whose root is a single spacing container holding both pages. Walking children yields one element, which is why the PDF export once produced a single tall page.
- `form.design.language` exists in `FormState`, is read by the export and the review summary, but **nothing ever writes it** — there is no language selector in the wizard. It is always `'English'`. Any logic keyed off it is dormant until that selector exists.
- Inline styles that set a background colour on a control must use `backgroundColor`, never the `background` shorthand, wherever `backgroundImage` is also set (the `Select` chevron). React re-applies only changed properties, so a changing shorthand wipes `background-repeat`/`-position` and never restores them — the chevron tiles across the control on hover.
