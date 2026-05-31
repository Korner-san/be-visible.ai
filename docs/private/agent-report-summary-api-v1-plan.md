# Agent Report Summary API — v1 Implementation Plan

## 1. Relevant Files & Routes Found

### Existing API Routes (reused logic from)
| File | Purpose |
|---|---|
| `app/api/reports/visibility/route.ts` | SOV, coverage over time, competitor mentions, sentiment |
| `app/api/prompts/stats/route.ts` | Per-prompt visibility score, mention rate, citation domains, demand score |
| `app/api/reports/citations/route.ts` | Citation URL/domain aggregation |
| `app/api/user/profile/route.ts` | User ownership pattern |

### Key helper files
| File | Purpose |
|---|---|
| `lib/supabase/server.ts` | Cookie-based session client (Next.js SSR) |
| `lib/supabase/service.ts` | Service role client (bypasses RLS for internal reads) |
| `lib/utils.ts` | Shared utilities |

### Frontend
| File | Purpose |
|---|---|
| `be-visible-google-ai-studio/components/ApiKeyPage.tsx` | API Key UI — currently **mock-only** (hardcoded key `sk_live_bv_a8f3d2c1e9b7f4a2d6c8e0f1b3a5d7c9`, no DB, no real generation) |

---

## 2. Database Tables Used

| Table | Used for |
|---|---|
| `brands` | Brand name, domain, owner_user_id |
| `brand_prompts` | Prompt text, category, demand_score, is_active |
| `daily_reports` | Report date, status, brand_id |
| `prompt_results` | brand_mentioned, brand_position, competitor_mention_details, citations per provider |
| `user_api_keys` | **New** — stores hashed API keys for external agent auth |

---

## 3. Test Brand: Incredibuild

| Field | Value |
|---|---|
| Brand ID | `b1a37d48-375f-477a-b838-38486e5e1c2d` |
| Brand Name | Incredibuild |
| Domain | incredibuild.com |
| Owner User ID | `4c229384-dbb0-4621-936b-76fc8885e478` |
| Onboarding | completed, first_report_status = succeeded |

---

## 4. Date Range with Real Data

Confirmed completed daily reports exist from **2026-05-15 through 2026-05-30**.

Best 7-day test window: **2026-05-24 to 2026-05-30**

Confirmed results in this window:
- Total prompt_results: **451**
- Brand mentions: **119** → overall mention rate **26%**
- Models with data: `chatgpt` (245), `claude` (137), `google_ai_overview` (69)
- Claude has **0 brand mentions** in this window (interesting signal for the agent)

---

## 5. Recommended Endpoint Design

```
GET /api/agent/report-summary?brandId=<uuid>&days=7
Authorization: Bearer sk_bv_<random>
```

Optional params:
- `days` — lookback window, default 7, max 90
- `models` — comma-separated: `chatgpt,claude,google_ai_overview`, default all three

Authentication: Bearer token validated against `user_api_keys` table.
Ownership: brand `owner_user_id` must match the key's `user_id`.

---

## 6. JSON Response Shape

```json
{
  "ok": true,
  "generatedAt": "2026-05-31T09:00:00.000Z",
  "brand": {
    "id": "b1a37d48-...",
    "name": "Incredibuild",
    "domain": "incredibuild.com",
    "activePrompts": 48
  },
  "period": {
    "from": "2026-05-24",
    "to": "2026-05-30",
    "days": 7
  },
  "latestReport": {
    "date": "2026-05-30",
    "status": "completed"
  },
  "visibility": {
    "mentionRate": 26,
    "totalResults": 451,
    "totalMentions": 119,
    "byModel": {
      "chatgpt":            { "mentionRate": 41, "results": 245, "mentions": 100 },
      "claude":             { "mentionRate": 0,  "results": 137, "mentions": 0   },
      "google_ai_overview": { "mentionRate": 28, "results": 69,  "mentions": 19  }
    }
  },
  "topPrompts": [
    { "text": "How do I find build acceleration software compatible with Visual Studio?", "mentionRate": 83, "demandScore": 4, "category": "Discovery" },
    { "text": "Which tools offer distributed processing for faster software builds?",        "mentionRate": 73, "demandScore": 4, "category": "Discovery" }
  ],
  "weakPrompts": [
    { "text": "How can I improve the efficiency of the CI/CD pipeline for automotive software?", "mentionRate": 0, "demandScore": 3, "category": "Discovery" },
    { "text": "What software tools help optimize embedded systems development?",               "mentionRate": 0, "demandScore": 3, "category": "Discovery" }
  ],
  "competitors": [
    { "name": "Jenkins",   "responses": 78, "sovPct": 17 },
    { "name": "GitLab CI", "responses": 71, "sovPct": 15 },
    { "name": "Bazel",     "responses": 51, "sovPct": 11 },
    { "name": "CircleCI",  "responses": 42, "sovPct":  9 }
  ],
  "citationDomains": [
    { "domain": "incredibuild.com", "mentions": 89, "pctTotal": 18 },
    { "domain": "github.com",       "mentions": 44, "pctTotal":  9 }
  ],
  "actionItems": [
    "Claude has 0% mention rate across all 137 results — Incredibuild is invisible on Claude; content optimized for Claude-style citations is missing.",
    "2 prompts with demand score 3 have 0% mention rate — target 'automotive CI/CD' and 'embedded systems' content gaps.",
    "Jenkins and GitLab CI together appear in 33% of all responses where Incredibuild is absent — these are the primary share-of-voice threats."
  ]
}
```

---

## 7. Auth Plan — API Key System

### Current state
The `ApiKeyPage.tsx` is fully mocked:
- Key is hardcoded as `sk_live_bv_a8f3d2c1e9b7f4a2d6c8e0f1b3a5d7c9`
- No DB table exists for API keys
- Regenerate/Show/Copy buttons have no real effect

### What we need (minimal real implementation)

**DB migration** (run once in Supabase SQL editor):
```sql
CREATE TABLE user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  label TEXT DEFAULT 'Default',
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX ON user_api_keys(key_hash);
```

**Key format:** `sk_bv_` + 32 random hex chars = `sk_bv_a1b2c3d4e5f6...`

**Key generation flow:**
1. `POST /api/agent/keys` — authenticated via Supabase session (logged-in user)
2. Generate `crypto.randomBytes(32).toString('hex')`
3. Store `sha256(rawKey)` in `user_api_keys.key_hash`
4. Return raw key **once only** — never stored in plaintext

**Validation flow (for agent requests):**
1. Extract `Bearer <token>` from Authorization header
2. `sha256(token)` → lookup in `user_api_keys`
3. Update `last_used_at`
4. Return `user_id` for ownership checks downstream

---

## 8. Implementation Steps

1. **DB migration** — create `user_api_keys` table
2. **`lib/api-key-auth.ts`** — `validateApiKey(req) → { userId, keyId } | null`
3. **`app/api/agent/keys/route.ts`** — GET (list keys) + POST (create key) + DELETE (revoke key)
4. **`app/api/agent/report-summary/route.ts`** — main summary endpoint
5. **`ApiKeyPage.tsx`** — replace mock with real key creation/display

---

## 9. Test Plan

```
# No key
GET /api/agent/report-summary?brandId=b1a37d48-...
→ 401 { ok: false, error: "missing_api_key" }

# Invalid key
Authorization: Bearer sk_bv_notreal
→ 401 { ok: false, error: "invalid_api_key" }

# Valid key, wrong brand (different owner)
Authorization: Bearer sk_bv_<valid>
GET ...?brandId=<other-users-brand-id>
→ 404 { ok: false, error: "brand_not_found" }

# Valid key, no data in range
GET ...?brandId=b1a37d48-...&days=1  (if no report today)
→ 200 { ok: true, latestReport: null, visibility: { mentionRate: 0, ... } }

# Valid key, real data
GET ...?brandId=b1a37d48-...&days=7
→ 200 { ok: true, brand: { name: "Incredibuild" }, ... full summary }
```

---

## 10. What is Intentionally Excluded from v1

| Excluded | Reason |
|---|---|
| Raw AI response text | Too large (50-200KB), not needed for agent reasoning |
| Individual citation URLs | Domains are sufficient; URLs add noise |
| Full 30/90-day historical data per prompt | Agent can request specific date ranges |
| Write actions (update prompts, add competitors) | Read-only is safe to ship; writes need RBAC first |
| MCP server | REST works immediately in Claude; MCP is an enhancement |
| Streaming / SSE | Standard JSON at ~3KB is fine |
| Sentiment/portrayal analysis | Nice-to-have, cut for simplicity |
| All 50 prompts | Top 5 + bottom 5 covers agent needs |
| Rate limiting infrastructure | Simple `last_used_at` check sufficient for v1 |
| Key rotation / expiry | Single key per user is fine for v1 |
