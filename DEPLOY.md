# VideoClipFlow — Deploy to Vercel + videoclipflow.com

## 1. Deploy frontend to Vercel

```bash
cd platform
npx vercel login    # Log in with your Vercel account
npx vercel          # Deploy (follow prompts)
```

- **Set up and deploy?** Yes
- **Which scope?** Your account
- **Link to existing project?** No
- **Project name?** videoclipflow (or leave default)
- **Directory?** ./ (current)

You'll get a URL like `videoclipflow-xxx.vercel.app`.

## 2. Add videoclipflow.com domain

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Open your project → **Settings** → **Domains**
3. Add `videoclipflow.com` and `www.videoclipflow.com`
4. Vercel will show DNS records to add at your domain registrar

**At your domain registrar (where you bought videoclipflow.com):**

- Add an **A record**: `@` → `76.76.21.21` (Vercel's IP)
- Or add a **CNAME**: `www` → `cname.vercel-dns.com`
- Vercel will show the exact records — follow their instructions

## 3. Run the backend (required for extraction)

The frontend is static. The **Flask backend** must run somewhere for extraction to work.

**Option A: Cloudflare Tunnel from your Mac**

```bash
# Terminal 1: Start backend
cd platform && python3 server.py

# Terminal 2: Expose via tunnel
cloudflared tunnel --url http://localhost:8099
# Or create a named tunnel for api.videoclipflow.com
```

Point `api.videoclipflow.com` to your tunnel URL (or use a named tunnel).

**Option B: Railway / Render / Fly.io**

Deploy `server.py` to a PaaS and set the root URL as `api.videoclipflow.com`.

## 4. Point api.videoclipflow.com to your backend

- **Cloudflare Tunnel:** Create a tunnel, add a CNAME `api` → `your-tunnel-id.cfargotunnel.com`
- **Railway/Render:** Add a custom domain `api.videoclipflow.com` in their dashboard

## 5. Environment variables (backend)

On your backend host, set:

```
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
```

## Summary

| URL | Host |
|-----|------|
| videoclipflow.com | Vercel (frontend) |
| api.videoclipflow.com | Your backend (Flask) |

The frontend at videoclipflow.com is configured to call `https://api.videoclipflow.com` for all API requests.
