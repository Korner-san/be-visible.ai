# be-visible.ai — ChatGPT Cookie Extractor

This tool logs into ChatGPT through Microsoft Edge, extracts your session
cookies, and saves them to the be-visible.ai database so the automation
system can use that account.

---

## Prerequisites

Before you start, make sure the following are installed on your PC:

| Software | Where to get it |
|---|---|
| **Node.js** (LTS) | https://nodejs.org → click "LTS" → install |
| **Microsoft Edge** | Pre-installed on Windows 10/11. If missing: https://microsoft.com/edge |
| **Git** (optional) | https://git-scm.com/download/win |

To check if Node.js is installed, open PowerShell and run:
```
node --version
```
You should see something like `v20.11.0`. If you get an error, install Node.js first.

---

## Step 1 — Download this branch

**Option A — Using Git (recommended):**
```powershell
git clone -b Extract https://github.com/Korner-san/be-visible.ai.git
cd be-visible.ai
```

**Option B — Download ZIP (no Git needed):**
1. Go to https://github.com/Korner-san/be-visible.ai
2. Click the branch dropdown → select **Extract**
3. Click **Code** → **Download ZIP**
4. Extract the ZIP to a folder (e.g. `C:\be-visible-extract`)
5. Open PowerShell and navigate to that folder:
```powershell
cd C:\be-visible-extract
```

---

## Step 2 — Create your .env.local file

**In PowerShell:**
```powershell
Copy-Item .env.local.example .env.local
notepad .env.local
```

**In CMD:**
```cmd
copy .env.local.example .env.local
notepad .env.local
```

Notepad will open. Replace `paste_your_service_role_key_here` with the
actual Supabase service role key (get it from whoever manages the project).

Save the file and close Notepad.

> ⚠️ Never share this file — it gives full database access.

---

## Step 3 — Install dependencies

```powershell
npm install
```

Then install the Edge browser driver for Playwright:

```powershell
npx playwright install msedge
```

This downloads a small browser driver (~few MB). You only need to do this once.

---

## Step 4 — Run the extractor

```powershell
node extract-cookies.js
```

Or using the npm shortcut:
```powershell
npm run extract
```

---

## Step 5 — Follow the on-screen prompts

The script will:

1. **Connect to the database** and show a list of existing ChatGPT accounts
2. **Ask you to select** an account to refresh, or add a new one
3. **If adding a new account**, ask for:
   - ChatGPT email address
   - Proxy host, port, username, password
   - Account role (`daily_report` or `onboarding`)
4. **Open Microsoft Edge** and navigate to chatgpt.com
5. **Give you 90 seconds** to log in manually (solve any CAPTCHAs, enter password, complete 2FA)
6. **Automatically extract** the session cookies once logged in
7. **Save to the database** and print a confirmation summary

> ⚠️ Do NOT close the Edge window while the script is running.
> The browser will close itself automatically after extraction.

---

## After Running

**If you refreshed an existing account:**
- Done. The new cookies are active immediately.

**If you added a new account:**
- The account is saved with `is_eligible = false`
- An admin needs to initialize the Browserless session on the server
- Once done, the admin sets `is_eligible = true` in the Supabase dashboard
- The account will be picked up by the next nightly schedule

---

## Troubleshooting

**"SUPABASE_SERVICE_ROLE_KEY not found"**
→ Your `.env.local` file is missing or in the wrong folder.
  Make sure it's in the same folder as `extract-cookies.js`.

**"Failed to fetch accounts: ..."**
→ The service role key in `.env.local` is wrong or has extra spaces.
  Open the file in Notepad and double-check the value.

**"Not logged in!"**
→ The 90-second window wasn't enough. Run the script again and log in faster.
  If CAPTCHAs are slow, try logging in on a different network.

**Edge doesn't open / Playwright error**
→ Run `npx playwright install msedge` again.
  If Edge isn't installed at the default path, install it from microsoft.com/edge.

**"Insert failed: duplicate key"**
→ That email already exists in the database. Re-run and select it from the
  existing accounts list to refresh its cookies instead.
