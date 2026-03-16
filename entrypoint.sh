#!/bin/sh
set -e
PORT="${PORT:-8099}"
exec gunicorn --bind "0.0.0.0:${PORT}" --workers 1 --timeout 300 server:app
