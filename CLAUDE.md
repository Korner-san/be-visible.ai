# be-visible.ai — Claude Instructions

## FRONTEND — ONLY `be-visible-google-ai-studio/`
This is the Vite + React app. ALL UI/frontend changes go here, nowhere else.

- `App.tsx` — routing state machine
- `components/` — all React components
- `lib/supabase.ts` — Supabase client

**Everything else in the root is v1-legacy dead code. Never edit it for UI purposes.**
The only exception: `app/api/` routes are still the active backend — edit those when needed.

| Task | Where |
|---|---|
| UI / components | `be-visible-google-ai-studio/` |
| API / server logic | `app/api/**/route.ts` |
| Worker scripts | Hetzner `/root/be-visible.ai/worker/` |
| Old Next.js files | DO NOT TOUCH |

---

## INFRASTRUCTURE

### Hetzner
- **Host**: root@135.181.203.202 — SSH key: `C:\Users\Acer\.ssh\hetzner_key` — Password: `Kornersmarter2023!`
- **Worker dir**: `/root/be-visible.ai/worker/`
- **File writing rule**: ALWAYS write files locally first with the Write tool, then SCP over. Never write via SSH heredocs — escaping always breaks.
  ```
  scp -i C:\Users\Acer\.ssh\hetzner_key <local-file> root@135.181.203.202:<remote-path>
  ```

### Supabase
- **Project ID**: tzfvtofjcvpddqfgxdtn
- Do NOT use Supabase MCP. When a DB change is needed, give the user exact SQL to run at:
  https://supabase.com/dashboard/project/tzfvtofjcvpddqfgxdtn/sql/new

### GitHub
- **Repo**: https://github.com/Korner-san/be-visible.ai (branch: `main`)
- **After any frontend or API change**, push to GitHub so Vercel auto-deploys:
  ```
  git add <changed files>
  git commit -m "..."
  git push origin main
  ```
- Always push after completing a task the user expects to see live.

### Browserless
- **Endpoint**: `production-sfo.browserless.io` — Basic plan ($35/mo), 15-min max connection
- **Token**: `process.env.BROWSERLESS_TOKEN` (in worker/.env on Hetzner)
- **Proxy**: Iproyal residential, US, sticky sessions
