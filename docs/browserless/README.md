# ChatGPT + Browserless Integration

**Complete documentation for ChatGPT automation using Browserless**

---

## 🎯 Quick Start

### Run Test
```bash
node tests/browserless-chatgpt.js
```

### Configuration
Test uses `kk1995current@gmail.com` ChatGPT Plus account from Supabase.

---

## 📊 Performance

| Metric | Value |
|--------|-------|
| **Total Time** | ~57 seconds |
| **Browserless Units** | ~58 units/prompt |
| **Citations** | 20-30 per response |
| **Monthly Cost** | $69.60 (20 prompts/day) |

---

## 🔧 How It Works

1. **Load Account** - Fetches ChatGPT Plus cookies from Supabase
2. **Connect** - Establishes Browserless session with cookies
3. **Navigate** - Opens chatgpt.com
4. **Send Prompt** - Types and submits prompt
5. **Wait Response** - Detects when response is complete
6. **Extract Citations** - Clicks "Sources" button, extracts links
7. **Update Status** - Marks account as active/expired/error

---

## 💾 Database Schema

**Table:** `chatgpt_accounts`

```sql
Essential Cookies:
- session_token       (main auth)
- csrf_token         (security)
- cloudflare_clearance (bypass)
- session_context    (session state)
- device_id          (device tracking)
- auth_info          (user identity)

Status Tracking:
- status: 'active' | 'expired' | 'error' | 'disabled'
- last_used_at
- last_validated_at
- error_message
```

---

## ⚙️ Optimizations

1. **Removed debug screenshots** → -16s
2. **Reduced wait times** → -4s
3. **Parallel citation extraction** → -10s
4. **Smarter stability detection** → -5s
5. **Better selectors** → -2s

**Total savings:** 29% faster, 28% cheaper

---

## 🚀 Integration into Worker

**File:** `worker/src/lib/providers/chatgpt.ts`

Key functions:
- `loadChatGPTAccount(email)` - Load cookies from DB
- `connectToBrowserless(cookies)` - Create session
- `sendPrompt(page, prompt)` - Submit prompt
- `extractCitations(page)` - Get sources

---

## 📝 Account Management

**Current Account:** kk1995current@gmail.com
- **Type:** ChatGPT Plus
- **Status:** Active
- **Last Validated:** 2025-10-31

### Add New Account
```sql
INSERT INTO chatgpt_accounts (email, display_name, account_type, ...)
VALUES ('email@example.com', 'Name', 'plus', ...);
```

### Update Account Status
Automatic via script when:
- ✅ `active` - Successful extraction
- ⚠️ `expired` - Session/auth errors
- ❌ `error` - Other failures

---

## 🐛 Troubleshooting

### No Citations Extracted
- Check if prompt requires web search
- Verify "Sources" button appears
- Account may be free tier (needs Plus)

### Session Expired
- Update cookies in database
- Get fresh `session_token` from browser
- Run test to validate

### Slow Performance
- Check Browserless region (use closer region)
- Verify network latency
- Consider upgrading Browserless plan

---

## 📊 Cost Analysis

**Browserless Plan:** Prototyping
- 20k units/month included
- $0.0020 per unit overage

**Usage:**
- 58 units/prompt
- 20 prompts/day = 1,160 units/day
- 34,800 units/month = **$69.60/month**

**ROI:** Much cheaper than API-only solutions while getting full citations

---

## ✅ Status

- ✅ Database table created
- ✅ Account stored and active
- ✅ Test script optimized
- ✅ Citations extracting successfully
- ✅ Ready for worker integration

---

**Last Updated:** October 31, 2025  
**Test File:** `/tests/browserless-chatgpt.js`  
**Status:** Production Ready


