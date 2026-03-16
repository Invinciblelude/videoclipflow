# Run VideoClipFlow Backend on a Server

The backend (`server.py`) must run 24/7 for extraction to work. Options:

---

## Option 1: Railway (easiest)

1. Go to [railway.app](https://railway.app) and sign in with GitHub.
2. **New Project** → **Deploy from GitHub repo** → select `Invinciblelude/videoclipflow`.
3. Set **Root Directory** to `platform` (or deploy the whole repo).
4. Railway will detect the Dockerfile. If not, set **Dockerfile path** to `platform/Dockerfile`.
5. **Variables** → Add:
   - `SUPABASE_SERVICE_ROLE_KEY` = your key from Supabase
   - `SUPABASE_URL` = `https://wqvytlojlhbdjzszptph.supabase.co`
   - `SUPABASE_ANON_KEY` = (from config.js)
6. **Settings** → **Networking** → **Generate Domain**. You'll get `xxx.railway.app`.
7. **Custom Domain** → Add `api.videoclipflow.com` and follow Railway's DNS instructions.
8. In Cloudflare DNS, add CNAME `api` → `xxx.railway.app` (or the hostname Railway gives).

---

## Option 2: Render

1. Go to [render.com](https://render.com) and sign in.
2. **New** → **Web Service** → connect your GitHub repo.
3. **Root Directory:** `platform`
4. **Environment:** Docker (Render will use the Dockerfile)
6. **Environment:** Add `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
7. **Custom Domain:** Add `api.videoclipflow.com`.
8. Update Cloudflare DNS: CNAME `api` → your Render hostname.

---

## Option 3: VPS (DigitalOcean, Linode, Hetzner, etc.)

### 1. Create a server

- Ubuntu 22.04, 2GB RAM minimum (4GB recommended for Whisper).
- Get the server IP.

### 2. SSH and set up

```bash
ssh root@YOUR_SERVER_IP

# Install dependencies
apt update && apt install -y python3 python3-pip python3-venv ffmpeg git

# Clone repo
cd /opt
git clone https://github.com/Invinciblelude/videoclipflow.git
cd videoclipflow/platform

# Create venv and install
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Create .env
nano .env
# Add: SUPABASE_SERVICE_ROLE_KEY=...
```

### 3. Run with systemd

Create `/etc/systemd/system/videoclipflow.service`:

```ini
[Unit]
Description=VideoClipFlow Backend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/videoclipflow/platform
Environment="PATH=/opt/videoclipflow/platform/venv/bin"
ExecStart=/opt/videoclipflow/platform/venv/bin/gunicorn --bind 0.0.0.0:8099 --workers 1 --timeout 300 server:app
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable videoclipflow
systemctl start videoclipflow
systemctl status videoclipflow
```

### 4. Cloudflare Tunnel on VPS

```bash
# Install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# Login (run once, copy URL to browser)
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create videoclipflow-api
cloudflared tunnel route dns videoclipflow-api api.videoclipflow.com

# Run tunnel as service
cloudflared tunnel run --url http://localhost:8099 videoclipflow-api
```

Or create a systemd service for the tunnel so it runs on boot.

---

## Option 4: Oracle Cloud Free Tier

Oracle offers a free VPS (4 ARM cores, 24GB RAM). Same steps as Option 3.

---

## Summary

| Option   | Cost        | Effort | Best for              |
|----------|-------------|--------|------------------------|
| Railway  | ~$5/mo      | Low    | Quick deploy           |
| Render   | Free tier   | Low    | Testing                |
| VPS      | $5–10/mo    | Medium | Full control           |
| Oracle   | Free        | Medium | Free 24/7              |

After deployment, set `api.videoclipflow.com` in Cloudflare DNS to point to your backend.
