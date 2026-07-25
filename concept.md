# Vacay — Upcoming Feature Specs

Repo: https://github.com/aparnaparashar/Vacay
Stack: Next.js/TypeScript/Tailwind (frontend) · FastAPI/Python/PostgreSQL (backend)

---

## 1. Travel guide Badge (Trip Cards)

### Purpose
Show a quick, at-a-glance travel advisory / entry-requirement indicator on the bottom-left of every trip card, so users don't have to leave the dashboard to check if their destination is safe or what's needed to enter.

### Data Source
**TuGo Travel Advisory API** — free REST API, general country info, trip advisories, and basic health/safety requirements for 225+ countries.
Docs: https://developer.tugo.com/page/Travel_Safe_API

### UX
- A small color-coded badge (green / yellow / red by risk level) pinned to the bottom-left corner of each trip card.
- Loading skeleton while fetching; hides gracefully if data is unavailable (no broken UI).
- Hover/click opens a popover with fuller detail: advisory summary, entry requirements, health notes, last updated date.
- Visual style matches existing glass-morphism/Tailwind conventions already in the trip card.

### Implementation Prompt (paste into Claude Code)

```
I'm working on my Next.js + FastAPI travel planner app (Vacay repo: frontend =
Next.js/TypeScript/Tailwind, backend = FastAPI/Python/PostgreSQL). I want to add a
"Travel Requirements" indicator to the bottom-left corner of each trip card on the
dashboard, using the TuGo Travel Advisory API (free REST API, docs:
https://developer.tugo.com/page/Travel_Safe_API).

Goal: For each trip card (which already has a destination country/city), show a
small badge/chip in the bottom-left corner displaying a quick travel advisory
summary (e.g. risk level, entry/health requirement flag) for that destination.
Clicking or hovering it should expand to show more detail (advisory text, entry
requirements, health notes) in a tooltip or popover.

Please do the following:

1. Explore the repo structure first (backend/app and frontend/ directories) to find:
   - Where trip card components live (likely frontend/components or frontend/app/dashboard)
   - How trip data currently stores destination info (city/country field name)
   - The existing pattern for backend API routes (FastAPI routers) and how the
     frontend calls them (API client/fetch wrapper)

2. Backend (FastAPI):
   - Add a new router/service, e.g. `app/services/travel_advisory.py`, that calls
     the TuGo Travel Advisory API for a given country/destination.
   - Add an endpoint like `GET /api/trips/{trip_id}/travel-advisory` or a generic
     `GET /api/travel-advisory?country={country}` that:
     - Resolves country name/code from the trip's destination
     - Calls TuGo's API with proper auth (check their docs for exact auth method
       — API key header vs query param)
     - Caches responses (in-memory or DB, e.g. 24hr TTL) to avoid rate limits
     - Returns a normalized JSON: { riskLevel, summary, entryRequirements,
       healthNotes, lastUpdated }
   - Handle errors gracefully (API down, country not found) — return a safe
     fallback object instead of crashing.

3. Frontend (Next.js):
   - Add a small `TravelAdvisoryBadge` component that:
     - Fetches advisory data for the trip's destination (via the new backend endpoint)
     - Renders a compact badge in the bottom-left of the trip card (color-coded
       by risk level: green/yellow/red, matching existing card styling)
     - Shows a loading skeleton while fetching, and hides gracefully if data is
       unavailable
     - On hover/click, shows a popover/tooltip with the fuller advisory summary
       and entry requirements
   - Integrate this component into the existing trip card component without
     breaking current layout — position it absolute bottom-left, matching
     existing spacing/z-index conventions in the codebase.

4. Add TuGo's credentials to environment variables. Give me a diff/addition for
   both `.env.example` files (backend and frontend) with placeholders, e.g.:

   Backend `.env`:
   TUGO_API_KEY=your_tugo_api_key_here
   TUGO_API_BASE_URL=https://developer.tugo.com/api
   TRAVEL_ADVISORY_CACHE_TTL_HOURS=24

   Frontend `.env.local` (only if any public config is needed, otherwise skip):
   NEXT_PUBLIC_ENABLE_TRAVEL_ADVISORY=true

5. Keep changes minimal and consistent with existing code style (TypeScript
   types, async patterns, error boundaries already used in the repo). Don't
   touch unrelated features.

6. After implementing, give me a short summary of every file changed/added and
   how to test it locally (which trip/country to test with, and what a
   successful badge should look like).
```

### `.env` Additions

**Backend `.env`**
```
TUGO_API_KEY=your_tugo_api_key_here
TUGO_API_BASE_URL=https://developer.tugo.com/api
TRAVEL_ADVISORY_CACHE_TTL_HOURS=24
```

**Frontend `.env.local`**
```
NEXT_PUBLIC_ENABLE_TRAVEL_ADVISORY=true
```

### Notes / Gotchas
- Confirm TuGo's exact auth scheme (API key header vs query param) from the live docs before wiring the backend call — not fully documented in the summary page.
- If trip destinations are stored as full addresses rather than clean country names, add a normalize-to-country step before calling the API.
- Cache aggressively (24hr+) since advisory data doesn't change minute-to-minute and free APIs often rate-limit.



