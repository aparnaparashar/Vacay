# Vacay — Travel Guide Feature (Combined: TuGo + Travel Risk Intelligence API)

Repo: https://github.com/aparnaparashar/Vacay
Stack: Next.js/TypeScript/Tailwind (frontend) · FastAPI/Python/PostgreSQL (backend)

**Two APIs, merged into one badge:**
1. **TuGo Travel Advisory API** — advisory state, entry/exit requirements, health info, safety info, climate/disaster notes. 225+ countries.
   Docs: https://developer.tugo.com/docs/read/travelsafe/v1/country
2. **Travel Risk Intelligence API** — real-time composite risk score (1-5), official advisory level, and live disaster alerts. 200+ countries.
   Docs: https://travelriskapi.com/

The backend calls both APIs in parallel, normalizes each response, and merges them into a single combined payload the frontend badge consumes.

---

## API Reference (confirmed from live docs)

### TuGo Travel Advisory API
- **Base URL:** `https://api.tugo.com/v1/travelsafe/countries/:country`
- **Auth:** header `X-Auth-API-Key: YOUR_TUGO_API_KEY`
- **Param:** `:country` = ISO country code (e.g. `GR`, `US`, `JP`)
- **Key response fields:**
  - `advisoryState` (numeric state), `hasAdvisoryWarning`, `hasRegionalAdvisory`, `advisoryText`, `recentUpdates`
  - `entryExitRequirement.requirementInfo[]` — passport/visa/entry requirement categories + descriptions
  - `health.healthInfo[]` / `health.diseasesAndVaccinesInfo` — vaccines, disease risk, medical facility notes
  - `safety.safetyInfo[]` — crime, terrorism, road travel, demonstrations, etc.
  - `climate.description` — natural disaster / seismic / flood / wildfire risk notes
  - `lawAndCulture.lawAndCultureInfo[]` — local law notes (dual citizenship, drugs, driving laws, currency rules)
  - No pagination needed — one country per call.
- Free tier, requires signup at http://developer.tugroup.com/apps/mykeys (or via developer.tugo.com registration).

### Travel Risk Intelligence API
- **Base URL:** `https://travelriskapi.com/api/v1`
- **Auth:** header `X-API-Key: YOUR_API_KEY` (demo key for testing: `demo-key-travel-risk-2026`)
- **Key endpoints:**
  - `GET /risk-score/{iso_code}` -> `{ iso_code, name, risk_score, advisory_level, active_alerts, calculation }`
  - `GET /alerts?country_iso={iso_code}` -> list of active disaster alerts (`alert_type`, `severity`, `location`, `description`, `event_date`)
  - `GET /countries/{iso_code}` -> `{ advisory_level, advisory_description, advisory_date, risk_score, last_updated }`
- Free tier: 100 requests/day.
- Error codes: 401, 404, 429, 500.

Both APIs key on **ISO country codes** — one shared country-name → ISO-code resolver on the backend serves both integrations.

---

## Purpose
Show one merged "Travel Guide" badge on the bottom-left of every trip card that
combines TuGo's advisory/entry/health/safety detail with the Travel Risk API's
live composite risk score and active disaster alerts — giving a fuller picture
than either API alone.

## Merged Data Shape (backend should return this from one endpoint)
```json
{
  "countryIso": "GR",
  "countryName": "Greece",
  "riskLevel": "low | medium | high",
  "riskScore": 2.1,
  "advisoryText": "Exercise normal security precautions",
  "hasAdvisoryWarning": false,
  "activeAlerts": [
    { "type": "earthquake", "severity": "Medium", "location": "..." }
  ],
  "entryRequirements": [
    { "category": "Visa", "description": "..." }
  ],
  "healthNotes": [
    { "category": "Routine Vaccines", "description": "..." }
  ],
  "safetyNotes": [
    { "category": "Crime", "description": "..." }
  ],
  "lastUpdated": "2026-07-20T00:00:00Z",
  "sources": { "tugo": true, "travelRisk": true }
}
```
`riskLevel`/`riskScore` come primarily from the Travel Risk API (it's built for
this); TuGo fills in the qualitative detail (entry requirements, health,
safety, law/culture) that the Risk API doesn't provide. If one API fails,
return partial data from the other rather than failing the whole badge
(`sources` flags tell the frontend what's actually present).

## UX
- Small color-coded badge positioned properly inside each individual trip card, avoiding any overlapping with existing elements (navigation, name-guide, etc.).
- Ensure proper formatting, spacing, and a consistent UI/UX that matches the rest of the page.
- Colored by `riskLevel` (green/yellow/red) — sourced properly from the Travel Risk Intelligence API's score.
- Small alert-count icon if `activeAlerts` is non-empty.
- Loading skeleton while fetching; hides gracefully if both sources fail.
- The user flow should be smooth, readable, and intuitive. Hover/click opens a well-formatted popover or modal with tabs or stacked sections: **Risk & Alerts**
  (score breakdown + active alerts) and **Entry & Health** (TuGo's visa/health/
  safety detail). If one source is missing, that section just doesn't render
  (no error shown to the user).

---

## Implementation Prompt (paste into Claude Code)

```
I'm working on my Next.js + FastAPI travel planner app (Vacay repo: frontend =
Next.js/TypeScript/Tailwind, backend = FastAPI/Python/PostgreSQL). I want to add
a combined "Travel Guide" badge to the bottom-left corner of each trip card on
the dashboard, merging data from TWO APIs:

1. TuGo Travel Advisory API
   - Base URL: https://api.tugo.com/v1/travelsafe/countries/:country
   - Auth: header "X-Auth-API-Key: YOUR_TUGO_API_KEY"
   - :country is an ISO country code (e.g. GR, US, JP)
   - Response includes: advisoryState, hasAdvisoryWarning, advisoryText,
     recentUpdates, entryExitRequirement.requirementInfo[] (category +
     description), health.healthInfo[] / diseasesAndVaccinesInfo, safety.safetyInfo[],
     climate.description, lawAndCulture.lawAndCultureInfo[]

2. Travel Risk Intelligence API
   - Base URL: https://travelriskapi.com/api/v1
   - Auth: header "X-API-Key: YOUR_API_KEY"
   - GET /risk-score/{iso_code} -> { risk_score, advisory_level, active_alerts, calculation }
   - GET /alerts?country_iso={iso_code} -> { data: [{ alert_type, severity, location, description, event_date }] }
   - Error codes: 401 unauthorized, 404 not found, 429 rate limited, 500 server error

Do NOT integrate any other travel/risk API besides these two.

Please do the following:

1. Explore the repo structure first (backend/app and frontend/ directories) to find:
   - Where trip card components live (likely frontend/components or frontend/app/dashboard)
   - How trip data currently stores destination info (city/country field name)
   - The existing pattern for backend API routes (FastAPI routers) and how the
     frontend calls them (API client/fetch wrapper)

2. Backend (FastAPI):
   - Add a shared country-name-to-ISO-code resolver (static mapping table or
     lightweight lookup) used by both integrations, since trips are likely
     stored as city/country strings.
   - Add `app/services/tugo_advisory.py` wrapping the TuGo country endpoint.
   - Add `app/services/travel_risk.py` wrapping the Travel Risk API's
     risk-score and alerts endpoints (call both in parallel).
   - Add ONE combined endpoint, e.g. `GET /api/trips/{trip_id}/travel-guide` or
     `GET /api/travel-guide?country={country}`, that:
     - Resolves the destination to an ISO code
     - Calls TuGo and Travel Risk API concurrently (e.g. asyncio.gather)
     - Normalizes both responses and merges them into the combined shape below
       (riskLevel/riskScore from Travel Risk API; advisoryText, entryRequirements,
       healthNotes, safetyNotes from TuGo; activeAlerts from Travel Risk API)
     - If one API call fails, still return data from the other with a `sources`
       flag indicating which succeeded — never fail the whole response because
       one source is down
     - Caches the merged result (in-memory or DB, e.g. 12-24hr TTL) to respect
       both APIs' rate limits (Travel Risk free tier is 100 req/day)

   Suggested merged response shape:
   {
     "countryIso": "GR",
     "countryName": "Greece",
     "riskLevel": "low | medium | high",
     "riskScore": 2.1,
     "advisoryText": "...",
     "hasAdvisoryWarning": false,
     "activeAlerts": [{ "type": "...", "severity": "...", "location": "..." }],
     "entryRequirements": [{ "category": "...", "description": "..." }],
     "healthNotes": [{ "category": "...", "description": "..." }],
     "safetyNotes": [{ "category": "...", "description": "..." }],
     "lastUpdated": "...",
     "sources": { "tugo": true, "travelRisk": true }
   }

3. Frontend (Next.js):
   - Add a `TravelGuideBadge` component that:
     - Fetches the merged travel-guide data for the trip's destination via the
       new backend endpoint. Ensure the Travel Risk Intelligence API is used properly and results are properly formatted.
     - Renders a compact badge inside the individual trip card, colored by
       `riskLevel` (green/yellow/red), with a small alert-count indicator if
       `activeAlerts` is non-empty.
     - Ensure there is no overlapping with trip card elements (like navigation, name-guide, etc.) by using proper formatting and spacing.
     - Ensures consistent UI/UX with the rest of the page, maintaining a smooth, readable, and intuitive user flow.
     - Shows a loading skeleton while fetching, hides gracefully if both
       sources are unavailable
     - On hover/click, shows a properly formatted popover with two sections: "Risk & Alerts"
       (score + active alerts) and "Entry & Health" (TuGo's visa/health/safety
       detail) — only render a section if its underlying source succeeded
       (check `sources` flags)
   - Integrate into the existing trip card component without breaking layout —
     position it thoughtfully inside the card, matching existing spacing, consistent UI/UX, and z-index conventions.

4. Add credentials to environment variables. Give me a diff/addition for both
   `.env.example` files (backend and frontend) with placeholders:

   Backend `.env`:
   TUGO_API_KEY=your_tugo_api_key_here
   TUGO_API_BASE_URL=https://api.tugo.com/v1/travelsafe/countries
   TRAVEL_RISK_API_KEY=your_travelrisk_api_key_here
   TRAVEL_RISK_API_BASE_URL=https://travelriskapi.com/api/v1
   TRAVEL_GUIDE_CACHE_TTL_HOURS=12

   Frontend `.env.local` (only if a public flag is needed, otherwise skip):
   NEXT_PUBLIC_ENABLE_TRAVEL_GUIDE_BADGE=true

5. Keep changes minimal and consistent with existing code style (TypeScript
   types, async patterns, error boundaries already used in the repo). Don't
   touch unrelated features, and don't add any API beyond these two.

6. After implementing, give me a short summary of every file changed/added and
   how to test it locally — including a country where both APIs return data
   cleanly (e.g. Greece / GR), and what the badge should look like if one
   source is deliberately unavailable (partial data render).
```

---

## `.env` Additions

**Backend `.env`**
```
TUGO_API_KEY=your_tugo_api_key_here
TUGO_API_BASE_URL=https://api.tugo.com/v1/travelsafe/countries
TRAVEL_RISK_API_KEY=your_travelrisk_api_key_here
TRAVEL_RISK_API_BASE_URL=https://travelriskapi.com/api/v1
TRAVEL_GUIDE_CACHE_TTL_HOURS=12
```

**Frontend `.env.local`**
```
NEXT_PUBLIC_ENABLE_TRAVEL_GUIDE_BADGE=true
```

## Notes / Gotchas
- **Rate limits differ:** TuGo is free/unspecified limit but registration-gated;
  Travel Risk API free tier is 100 req/day. Cache the *merged* result per
  country (not per trip) so trips sharing a destination reuse one cached entry.
- **Both APIs key on ISO codes** — build one shared resolver, don't duplicate
  country-to-ISO logic across two services.
- **Partial failure is expected, not exceptional.** Since these are two
  independent third-party APIs, design the merge step and the UI to degrade
  gracefully (show whichever half of the data is available) rather than
  treating any single API failure as a hard error.
- TuGo's response nesting is deep (`entryExitRequirement.requirementInfo`,
  `health.diseasesAndVaccinesInfo`, etc.) — flatten to the simpler merged shape
  above so the frontend doesn't need to know about TuGo's raw structure.
- Get real API keys before shipping: TuGo via developer.tugo.com registration,
  Travel Risk API via the free-key signup form on travelriskapi.com (demo key
  works for local dev only).
