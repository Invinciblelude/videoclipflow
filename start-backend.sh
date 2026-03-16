#!/bin/bash
# VideoClipFlow backend — run this to start server + tunnel
# You must: 1) Add SUPABASE_SERVICE_ROLE_KEY to .env  2) Add api CNAME in GoDaddy

cd "$(dirname "$0")"

if ! grep -q "SUPABASE_SERVICE_ROLE_KEY=eyJ" .env 2>/dev/null; then
  echo "⚠️  Edit .env and paste your Supabase service_role key (from Dashboard → Settings → API)"
  echo "   Then run this script again."
  exit 1
fi

echo "Installing deps..."
pip install -q -r requirements.txt 2>/dev/null || pip3 install -q -r requirements.txt

echo "Starting backend on http://localhost:8099"
echo "Starting Cloudflare tunnel for api.videoclipflow.com..."
echo ""
echo "Keep this window open. In GoDaddy DNS, add: CNAME api → (tunnel hostname)"
echo ""

# Start server in background, tunnel in foreground (so we see tunnel URL)
python3 server.py &
SERVER_PID=$!
sleep 2
cloudflared tunnel --url http://localhost:8099 &
TUNNEL_PID=$!

trap "kill $SERVER_PID $TUNNEL_PID 2>/dev/null; exit" INT TERM
wait
