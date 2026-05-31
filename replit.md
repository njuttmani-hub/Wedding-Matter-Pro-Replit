# Wedding Matter Pro

Premium wedding invitation card studio — customers fill an 8-step wizard to select their card "matter" (content), and designers receive a structured CorelDRAW export.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 18 + Vite + Tailwind v4 + Framer Motion + Lucide React
- No backend — frontend-only app

## Where things live

- `artifacts/wedding-matter-pro/src/WeddingApp.tsx` — entire app (all components)
- `artifacts/wedding-matter-pro/src/data/constants.ts` — all data (templates, deities, fonts, etc.)
- `artifacts/wedding-matter-pro/src/types.ts` — TypeScript interfaces

## Architecture decisions

- Frontend-only: all state is local React state, no API calls
- Single large WeddingApp.tsx keeps all components co-located for easy editing
- Inline styles used for the card palette system (light/dark) to avoid CSS variable conflicts
- Google Fonts loaded dynamically via DOM injection in a useEffect (avoids double-load)
- `Palette` icon from lucide-react aliased to `PaletteIcon` to avoid collision with the `Palette` TypeScript type

## Product

- **Type mode only**: 8-step wizard (bride/groom details, deity, template, programmes, extras, typography) with live card preview + CorelDRAW export
- **Live card preview**: split into two pages — Page 1 (deities, template, names, address, compliments, kids, closing) and Page 2 (programmes); white background with black text for legibility
- **Reception meal type**: dinner or lunch selector for reception events, shown as "from X onwards (dinner/lunch)" on the card
- **CorelDRAW export**: structured plain-text block generated on submission, copyable by designer
- **Admin dashboard**: order listing with status badges; per-order modal shows card preview + export
- **22 invitation templates** across 8 categories (Classic, Romantic, Daughter, Modern, Reception, etc.)
- **12 deities** with glyphs and mantras
- **20+ Google Fonts** supporting English, Hindi, Marathi, Gujarati scripts

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Do NOT rename `Palette` type in `src/types.ts` — it conflicts with the lucide icon of the same name (hence the alias `Palette as PaletteIcon` in WeddingApp.tsx)
- The cartographer Replit plugin logs a Babel parse error for `Palette` — this is a false alarm from the plugin; the app compiles and runs fine

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
