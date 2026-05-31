# Agent Report API — Testing Guide

## 1. Goal of This Test

This document explains how to test the Agent Report Summary API v1 end-to-end on the live Vercel deployment.

All environment variables (Supabase URL, service role key, anon key) are already configured in Vercel.
No local setup is required. Tests run against the production app at `https://app.be-visible.ai`.

The goal is to verify:
- API key generation works (frontend + DB)
- API authentication works (Bearer token validation)
- Brand ownership validation works (user can only access own brands)
- Report summary endpoint returns real data
- Frontend API Key page works end-to-end
- Claude can consume the endpoint and produce useful insights

---

## 2. Prerequisites

Before testing, confirm:

1. DB migration has been executed in Supabase (see SQL below)
2. RLS has been enabled on the new table
3. Latest code has been pushed to GitHub and Vercel deploy has completed
4. You are logged in to the app at `https://be-visible.ai`

**Required migration (run once in Supabase SQL editor):**
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

ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;
```

---

## 3. URLs to Test

| What | URL |
|---|---|
| App (live) | `https://app.be-visible.ai` |
| API Key page | Dashboard → API Key (sidebar) |
| Summary endpoint | `GET https://app.be-visible.ai/api/agent/report-summary` |
| Key management | `POST https://app.be-visible.ai/api/agent/keys` |

---

## 4. Test Brand Information

| Field | Value |
|---|---|
| Brand Name | Incredibuild |
| Brand ID | `b1a37d48-375f-477a-b838-38486e5e1c2d` |
| Domain | incredibuild.com |
| Recommended test window | 2026-05-24 → 2026-05-30 |
| Reports confirmed | 15 completed daily reports in this range |

---

## 5. Step 1 — Generate API Key (Frontend)

1. Log in to the app and open the **API Key** page from the sidebar
2. Click **Generate Key**
3. Copy the key immediately — it is shown **once only**
4. Verify:
   - Key starts with `sk_bv_`
   - Status badge shows **Active**
   - The UI shows a warning: "Copy this key now — it will not be shown again"

After page refresh:
- Key display shows `sk_bv_••••••••••••••••` (masked)
- Status still shows Active
- **The raw key is gone from the UI — this is correct behaviour**

---

## 6. Step 2 — Verify Database Record

Open Supabase → Table Editor → `user_api_keys`
(`https://supabase.com/dashboard/project/tzfvtofjcvpddqfgxdtn/editor`)

Confirm the new row has:
- `user_id` = your logged-in user's UUID
- `key_hash` = a 64-character hex string (SHA-256)
- `label` = `Default`
- `created_at` = now
- `last_used_at` = null (not used yet)
- **No plaintext key stored anywhere** ✓

---

## 7. Step 3 — Test: No API Key → 401

```bash
curl "https://app.be-visible.ai/api/agent/report-summary?brandId=b1a37d48-375f-477a-b838-38486e5e1c2d"
```

Expected response (HTTP 401):
```json
{
  "ok": false,
  "error": "invalid_api_key",
  "hint": "Provide a valid Bearer token in the Authorization header."
}
```

---

## 8. Step 4 — Test: Invalid Key → 401

```bash
curl -H "Authorization: Bearer sk_bv_thisisnotreal" \
  "https://app.be-visible.ai/api/agent/report-summary?brandId=b1a37d48-375f-477a-b838-38486e5e1c2d"
```

Expected response (HTTP 401):
```json
{
  "ok": false,
  "error": "invalid_api_key"
}
```

---

## 9. Step 5 — Test: Valid Key + Real Data → 200

Replace `sk_bv_xxxxx` with the key you generated in Step 1.

```bash
curl -H "Authorization: Bearer sk_bv_xxxxx" \
  "https://app.be-visible.ai/api/agent/report-summary?brandId=b1a37d48-375f-477a-b838-38486e5e1c2d&days=7"
```

Expected response (HTTP 200):
```json
{
  "ok": true,
  "generatedAt": "...",
  "brand": {
    "name": "Incredibuild",
    "domain": "incredibuild.com",
    "activePrompts": 48
  },
  "period": { "from": "2026-05-24", "to": "2026-05-30", "days": 7 },
  "latestReport": { "date": "2026-05-30", "status": "completed" },
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
  "topPrompts": [ ... ],
  "weakPrompts": [ ... ],
  "competitors": [
    { "name": "Jenkins",   "responses": 78 },
    { "name": "GitLab CI", "responses": 71 },
    { "name": "Bazel",     "responses": 51 },
    { "name": "CircleCI",  "responses": 42 }
  ],
  "citationDomains": [ ... ],
  "actionItems": [
    "Claude shows 0% mention rate across 137 results — ...",
    "...",
    "..."
  ]
}
```

**Verify these fields are all present:**
- `ok: true`
- `visibility.byModel` has chatgpt, claude, google_ai_overview
- `topPrompts` has at least 3 items
- `weakPrompts` has at least 1 item (0% mention rate prompts)
- `competitors` has at least Jenkins and GitLab CI
- `citationDomains` has incredibuild.com near the top
- `actionItems` mentions Claude 0% visibility

**Known signal to verify:** Claude `mentionRate: 0` — this is real data, not a bug. It means Incredibuild is not appearing in Claude's answers in this window. The `actionItems` array should surface this.

After a valid call, verify in Supabase that `user_api_keys.last_used_at` was updated.

---

## 10. Step 6 — Test: Wrong Brand Ownership → 404

Use your valid key but pass a brand ID that belongs to a different user.
Any brand ID that is not `b1a37d48-...` and is owned by a different user will work.

```bash
curl -H "Authorization: Bearer sk_bv_xxxxx" \
  "https://app.be-visible.ai/api/agent/report-summary?brandId=00000000-0000-0000-0000-000000000000"
```

Expected response (HTTP 404):
```json
{
  "ok": false,
  "error": "brand_not_found"
}
```

The endpoint intentionally returns 404 (not 403) to avoid leaking that a brand ID exists.

---

## 11. Step 7 — Test: Empty Data Window → 200 with Empty Arrays

```bash
curl -H "Authorization: Bearer sk_bv_xxxxx" \
  "https://app.be-visible.ai/api/agent/report-summary?brandId=b1a37d48-375f-477a-b838-38486e5e1c2d&days=1"
```

If no report ran today, expected response:
```json
{
  "ok": true,
  "latestReport": { "date": "2026-05-30", "status": "completed" },
  "visibility": { "mentionRate": 0, "totalResults": 0, "totalMentions": 0, "byModel": {} },
  "topPrompts": [],
  "weakPrompts": [],
  "competitors": [],
  "citationDomains": [],
  "actionItems": []
}
```

The endpoint must not crash or return 500. Empty arrays are correct behaviour.

---

## 12. Step 8 — Test Claude Integration

Paste the following into Claude (claude.ai or Claude Desktop):

```
You have access to BeVisible data.

Call this endpoint to get the latest brand visibility report:
GET https://app.be-visible.ai/api/agent/report-summary?brandId=b1a37d48-375f-477a-b838-38486e5e1c2d&days=7
Authorization: Bearer sk_bv_xxxxx

The response is JSON. Analyze it and answer:
1. What is the overall brand visibility this week?
2. Which AI model shows the weakest brand presence?
3. Which prompts have the highest mention rate?
4. Which prompts have high demand but 0% visibility (content gaps)?
5. Who are the main competitor threats?
6. Which citation domains should we target?
7. What are the top 3 recommended actions?
```

**Expected behaviour:** Claude fetches the endpoint, reads the JSON, and produces a structured visibility analysis with specific numbers from the data.

---

## 13. Files Changed in This Implementation

| File | Type | Purpose |
|---|---|---|
| `lib/api-key-auth.ts` | New | Bearer token validation + key generation helpers |
| `app/api/agent/keys/route.ts` | New | GET / POST / DELETE key management |
| `app/api/agent/report-summary/route.ts` | New | Main agent-facing summary endpoint |
| `be-visible-google-ai-studio/components/ApiKeyPage.tsx` | Modified | Real key generation replacing mock |
| `docs/private/agent-report-summary-api-v1-plan.md` | New | Architecture + design decisions |
| `docs/agent-report-testing-guide.md` | New | This file |

---

## 14. Known v1 Limitations

These are intentional — do not fix in v1:

- No MCP server (REST only)
- No streaming responses
- No raw AI response text exposed
- No individual citation URLs (domains only)
- No write actions
- No rate limiting beyond `last_used_at` tracking
- No historical charts or trend data
- No key expiration or rotation
- No multiple keys per user (first key only shown)

---

## 15. Do Not Do Yet

- Do not deploy changes beyond what is in this PR
- Do not expose raw AI response text
- Do not add write permissions to the API
- Do not refactor existing API routes
- Do not add MCP layer yet
- Do not add blockchain/Chainlink ideas
