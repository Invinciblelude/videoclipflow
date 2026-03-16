import os
import uuid
import time
import json
import shutil
import subprocess
import threading
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime, timedelta

from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder=".", static_url_path="")
CORS(app)

UPLOAD_DIR = Path("uploads")
OUTPUT_DIR = Path("outputs")
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base")
MAX_FREE_DAILY = int(os.getenv("MAX_FREE_DAILY", "100"))

# Payment verification
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://wqvytlojlhbdjzszptph.supabase.co")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indxdnl0bG9qbGhiZGp6c3pwdHBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNzY4NDQsImV4cCI6MjA4ODk1Mjg0NH0.WwPPa9EYvrpCgQVvHoBuYx1srsLeJc-_ltfAQVZzpss")
SUPABASE_SERVICE_ROLE = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
TRON_USDT_ADDRESS = "TLUPuJ6ix62HSrYzv8rxYwRudD7LZWK24b"
USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"  # TRC-20 USDT

jobs = {}
usage = {}


def get_daily_usage(ip):
    today = datetime.now().strftime("%Y-%m-%d")
    key = f"{ip}:{today}"
    return usage.get(key, 0)


def increment_usage(ip):
    today = datetime.now().strftime("%Y-%m-%d")
    key = f"{ip}:{today}"
    usage[key] = usage.get(key, 0) + 1


@app.route("/")
def serve_index():
    return send_from_directory(".", "index.html")


@app.route("/<path:path>")
def serve_static(path):
    return send_from_directory(".", path)


@app.route("/api/extract", methods=["POST"])
def extract():
    data = request.json or {}
    url = data.get("url", "").strip()
    outputs = data.get("outputs", [])
    ip = request.remote_addr

    if get_daily_usage(ip) >= MAX_FREE_DAILY:
        return jsonify({"error": "Daily free limit reached. Upgrade for more."}), 429

    if not url:
        return jsonify({"error": "URL is required"}), 400
    if not outputs:
        return jsonify({"error": "Select at least one output type"}), 400

    job_id = str(uuid.uuid4())[:12]
    job_dir = OUTPUT_DIR / job_id
    job_dir.mkdir(exist_ok=True)

    jobs[job_id] = {
        "id": job_id,
        "status": "processing",
        "progress": 0,
        "step": "Starting...",
        "url": url,
        "outputs": outputs,
        "results": [],
        "created": time.time(),
    }

    thread = threading.Thread(target=process_job, args=(job_id, url, outputs, job_dir))
    thread.daemon = True
    thread.start()

    increment_usage(ip)
    return jsonify({"job_id": job_id})


@app.route("/api/upload", methods=["POST"])
def upload():
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    outputs = request.form.getlist("outputs") or ["transcript", "captions"]
    ip = request.remote_addr

    if get_daily_usage(ip) >= MAX_FREE_DAILY:
        return jsonify({"error": "Daily free limit reached. Upgrade for more."}), 429

    job_id = str(uuid.uuid4())[:12]
    job_dir = OUTPUT_DIR / job_id
    job_dir.mkdir(exist_ok=True)

    ext = Path(file.filename).suffix or ".mp4"
    source_path = job_dir / f"source{ext}"
    file.save(str(source_path))

    jobs[job_id] = {
        "id": job_id,
        "status": "processing",
        "progress": 0,
        "step": "Starting...",
        "url": file.filename,
        "outputs": outputs,
        "results": [],
        "created": time.time(),
    }

    thread = threading.Thread(
        target=process_job_file, args=(job_id, str(source_path), outputs, job_dir)
    )
    thread.daemon = True
    thread.start()

    increment_usage(ip)
    return jsonify({"job_id": job_id})


@app.route("/api/status/<job_id>")
def job_status(job_id):
    job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(job)


@app.route("/api/download/<job_id>/<filename>")
def download_file(job_id, filename):
    job_dir = OUTPUT_DIR / job_id
    file_path = job_dir / filename
    if not file_path.exists():
        return jsonify({"error": "File not found"}), 404
    return send_file(str(file_path), as_attachment=True)


@app.route("/api/usage")
def check_usage():
    ip = request.remote_addr
    used = get_daily_usage(ip)
    return jsonify({"used": used, "limit": MAX_FREE_DAILY, "remaining": max(0, MAX_FREE_DAILY - used)})


def _get_user_from_jwt(jwt_token):
    """Validate JWT and return user_id. Returns None if invalid."""
    if not jwt_token or not jwt_token.startswith("eyJ"):
        return None
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL.rstrip('/')}/auth/v1/user",
            headers={"Authorization": f"Bearer {jwt_token}", "apikey": SUPABASE_ANON_KEY},
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read().decode())
            return data.get("id")
    except Exception:
        return None


def _verify_tron_usdt_tx(tx_hash, expected_amount_usd, to_address):
    """Verify TRC-20 USDT transaction. Returns (ok, error_msg)."""
    # USDT has 6 decimals: 5 USDT = 5000000, 9 USDT = 9000000
    expected_raw = int(expected_amount_usd * 1_000_000)
    tx_hash = tx_hash.strip()
    try:
        # TronGrid v1: get TRC20 transactions for our address, find this tx
        req = urllib.request.Request(
            f"https://api.trongrid.io/v1/accounts/{to_address}/transactions/trc20?limit=200&contract_address={USDT_CONTRACT}&only_confirmed=true",
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=20) as r:
            resp = json.loads(r.read().decode())
        for t in resp.get("data", []):
            if t.get("transaction_id") == tx_hash:
                # Check we are the "to" address
                if t.get("to", "").upper() != to_address.upper():
                    return False, "Transaction not sent to our address"
                amt = int(t.get("value", 0))
                if amt >= int(expected_raw * 0.99):  # allow 1% tolerance
                    return True, None
                return False, f"Amount too low (expected {expected_amount_usd} USDT, got {amt/1e6:.2f})"
        return False, "Transaction not found. Wait a minute for confirmation, then try again."
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode()[:200] if e.fp else ""
        except Exception:
            body = ""
        return False, f"Blockchain error: {body or str(e)}"
    except Exception as e:
        return False, str(e)[:120]


def _grant_access_via_supabase(user_id, plan, chain, amount, tx_hash):
    """Update Supabase user_access and payments using service role."""
    if not SUPABASE_SERVICE_ROLE:
        return False, "Server not configured for payment verification"
    try:
        days = 14 if plan == "trial" else 30
        expires_at = (datetime.utcnow() + timedelta(days=days)).isoformat() + "Z"
        headers = {
            "apikey": SUPABASE_SERVICE_ROLE,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }
        # Insert payment with verified status
        pay_body = json.dumps({
            "user_id": user_id,
            "plan": plan,
            "chain": chain,
            "amount": amount,
            "tx_hash": tx_hash,
            "status": "verified",
        })
        req = urllib.request.Request(
            f"{SUPABASE_URL.rstrip('/')}/rest/v1/payments",
            data=pay_body.encode(),
            headers={**headers, "Prefer": "return=representation"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=10)
        # Upsert user_access
        access_body = json.dumps({
            "user_id": user_id,
            "plan": plan,
            "expires_at": expires_at,
            "is_active": True,
        })
        req2 = urllib.request.Request(
            f"{SUPABASE_URL.rstrip('/')}/rest/v1/user_access",
            data=access_body.encode(),
            headers={**headers, "Prefer": "resolution=merge-duplicates,return=minimal"},
            method="POST",
        )
        urllib.request.urlopen(req2, timeout=10)
        return True, None
    except Exception as e:
        return False, str(e)[:150]


@app.route("/api/verify-payment", methods=["POST"])
def verify_payment():
    """Verify crypto payment on-chain and grant access. Requires Authorization: Bearer <user_jwt>."""
    auth = request.headers.get("Authorization") or ""
    if not auth.startswith("Bearer "):
        return jsonify({"error": "Missing or invalid Authorization header"}), 401
    jwt_token = auth[7:].strip()
    user_id = _get_user_from_jwt(jwt_token)
    if not user_id:
        return jsonify({"error": "Invalid or expired session. Please sign in again."}), 401

    data = request.json or {}
    tx_hash = (data.get("tx_hash") or "").strip()
    plan = data.get("plan", "trial")
    chain = data.get("chain", "tron")

    if not tx_hash or len(tx_hash) < 32:
        return jsonify({"error": "Please paste your transaction hash"}), 400
    if plan not in ("trial", "monthly"):
        return jsonify({"error": "Invalid plan"}), 400

    amount = 5 if plan == "trial" else 9

    if chain == "tron":
        ok, err = _verify_tron_usdt_tx(tx_hash, amount, TRON_USDT_ADDRESS)
    else:
        return jsonify({"error": "Only TRC-20 USDT is supported for verification. Use USDT on Tron network."}), 400

    if not ok:
        return jsonify({"error": err or "Payment could not be verified"}), 400

    ok, err = _grant_access_via_supabase(user_id, plan, chain, amount, tx_hash)
    if not ok:
        return jsonify({"error": err or "Failed to activate access"}), 500

    return jsonify({"success": True, "message": "Payment verified. Your access is now active."})


def update_job(job_id, **kwargs):
    if job_id in jobs:
        jobs[job_id].update(kwargs)


def process_job(job_id, url, outputs, job_dir):
    try:
        update_job(job_id, step="Downloading media...", progress=10)
        media_path = download_media(url, job_dir)
        if not media_path:
            update_job(job_id, status="error", step="Failed to download media")
            return

        process_outputs(job_id, media_path, outputs, job_dir)

    except Exception as e:
        update_job(job_id, status="error", step=f"Error: {str(e)}")


def process_job_file(job_id, source_path, outputs, job_dir):
    try:
        update_job(job_id, step="Processing uploaded file...", progress=10)
        process_outputs(job_id, source_path, outputs, job_dir)
    except Exception as e:
        update_job(job_id, status="error", step=f"Error: {str(e)}")


def process_outputs(job_id, media_path, outputs, job_dir):
    results = []

    audio_path = job_dir / "audio.mp3"
    segments = []
    update_job(job_id, step="Extracting audio...", progress=25)
    extract_audio(media_path, str(audio_path))

    if "audio" in outputs and audio_path.exists():
        size = audio_path.stat().st_size
        results.append({
            "type": "audio",
            "filename": "audio.mp3",
            "label": "Audio (MP3)",
            "detail": f"MP3 • {format_size(size)}",
            "icon": "🎵",
        })

    needs_transcription = any(o in outputs for o in ("transcript", "captions", "clips"))
    if needs_transcription:
        update_job(job_id, step="Running AI transcription...", progress=45)
        segments = transcribe_audio(str(audio_path))

        if "transcript" in outputs:
            update_job(job_id, step="Generating transcript...", progress=65)
            txt_path = job_dir / "transcript.txt"
            write_transcript(segments, str(txt_path))
            size = txt_path.stat().st_size
            word_count = sum(len(s["text"].split()) for s in segments)
            results.append({
                "type": "transcript",
                "filename": "transcript.txt",
                "label": "Transcript",
                "detail": f"TXT • {word_count} words • {format_size(size)}",
                "icon": "📄",
            })

        if "captions" in outputs:
            update_job(job_id, step="Generating captions...", progress=75)
            srt_path = job_dir / "captions.srt"
            write_srt(segments, str(srt_path))
            size = srt_path.stat().st_size
            results.append({
                "type": "captions",
                "filename": "captions.srt",
                "label": "Captions (SRT)",
                "detail": f"SRT • {len(segments)} segments • {format_size(size)}",
                "icon": "🎬",
            })

    if "video" in outputs:
        update_job(job_id, step="Preparing video...", progress=80)
        video_ext = Path(media_path).suffix
        if video_ext in (".mp4", ".webm", ".mkv", ".mov"):
            video_out = job_dir / f"video{video_ext}"
            if str(media_path) != str(video_out):
                shutil.copy2(media_path, video_out)
            size = video_out.stat().st_size
            results.append({
                "type": "video",
                "filename": f"video{video_ext}",
                "label": "Video",
                "detail": f"{video_ext.upper().strip('.')} • {format_size(size)}",
                "icon": "🎥",
            })

    if "clips" in outputs and segments:
        update_job(job_id, step="Creating smart clips...", progress=85)
        clip_results = create_smart_clips(media_path, segments, job_dir)
        results.extend(clip_results)

    if "ocr" in outputs:
        update_job(job_id, step="Extracting text (OCR)...", progress=92)
        ocr_result = run_ocr(media_path, job_dir)
        if ocr_result:
            results.append(ocr_result)

    update_job(job_id, status="complete", progress=100, step="Done!", results=results)


def download_media(url, job_dir):
    try:
        import yt_dlp

        ydl_opts = {
            "outtmpl": str(job_dir / "source.%(ext)s"),
            "noplaylist": True,
            "merge_output_format": "mp4",
            "quiet": True,
            "no_warnings": True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        for f in job_dir.iterdir():
            if f.name.startswith("source.") and f.suffix not in (".part", ".ytdl"):
                return str(f)
        return None
    except Exception:
        return None


def extract_audio(media_path, audio_path):
    try:
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", media_path,
                "-vn", "-acodec", "libmp3lame", "-ab", "192k",
                "-ar", "44100", audio_path,
            ],
            capture_output=True, timeout=120,
        )
    except Exception:
        pass


def transcribe_audio(audio_path):
    try:
        from faster_whisper import WhisperModel
        model = WhisperModel(WHISPER_MODEL, compute_type="int8")
        segments_gen, info = model.transcribe(audio_path, word_timestamps=True)
        segments = []
        for seg in segments_gen:
            segments.append({
                "start": seg.start,
                "end": seg.end,
                "text": seg.text.strip(),
            })
        return segments
    except Exception:
        return []


def write_transcript(segments, path):
    with open(path, "w") as f:
        for seg in segments:
            mins = int(seg["start"] // 60)
            secs = int(seg["start"] % 60)
            f.write(f"[{mins:02d}:{secs:02d}] {seg['text']}\n")


def write_srt(segments, path):
    with open(path, "w") as f:
        for i, seg in enumerate(segments, 1):
            start = format_srt_time(seg["start"])
            end = format_srt_time(seg["end"])
            f.write(f"{i}\n{start} --> {end}\n{seg['text']}\n\n")


def format_srt_time(seconds):
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def format_size(size_bytes):
    if size_bytes < 1024:
        return f"{size_bytes} B"
    if size_bytes < 1048576:
        return f"{size_bytes / 1024:.1f} KB"
    return f"{size_bytes / 1048576:.1f} MB"


def create_smart_clips(media_path, segments, job_dir):
    """Cut the best moments from the video into short vertical clips."""
    results = []
    if not segments or Path(media_path).suffix not in (".mp4", ".webm", ".mkv", ".mov"):
        return results

    scored = []
    for i, seg in enumerate(segments):
        duration = seg["end"] - seg["start"]
        word_count = len(seg["text"].split())
        if duration < 1 or word_count < 3:
            continue
        words_per_sec = word_count / max(duration, 0.1)
        score = words_per_sec * min(word_count, 30)
        scored.append((score, i, seg))

    scored.sort(key=lambda x: x[0], reverse=True)
    top = scored[:5]
    top.sort(key=lambda x: x[1])

    for clip_num, (score, idx, seg) in enumerate(top, 1):
        start = max(0, seg["start"] - 0.5)
        end = seg["end"] + 0.5
        duration = end - start
        if duration < 3:
            continue
        if duration > 60:
            end = start + 60
            duration = 60

        clip_path = job_dir / f"clip_{clip_num}.mp4"
        try:
            subprocess.run([
                "ffmpeg", "-y",
                "-ss", str(start), "-t", str(duration),
                "-i", media_path,
                "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2",
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-c:a", "aac", "-b:a", "128k",
                str(clip_path),
            ], capture_output=True, timeout=60)
        except Exception:
            continue

        if clip_path.exists():
            size = clip_path.stat().st_size
            preview = seg["text"][:50] + ("..." if len(seg["text"]) > 50 else "")
            results.append({
                "type": "clips",
                "filename": f"clip_{clip_num}.mp4",
                "label": f"Clip {clip_num}",
                "detail": f"MP4 • {duration:.0f}s • {format_size(size)} — \"{preview}\"",
                "icon": "✂️",
            })

    return results


def run_ocr(media_path, job_dir):
    """Extract text from images/PDFs using Tesseract or frame capture."""
    ext = Path(media_path).suffix.lower()

    if ext in (".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".webp"):
        return ocr_image(media_path, job_dir)

    if ext == ".pdf":
        return ocr_pdf(media_path, job_dir)

    if ext in (".mp4", ".webm", ".mkv", ".mov"):
        frame_path = job_dir / "frame.png"
        try:
            subprocess.run([
                "ffmpeg", "-y", "-i", media_path,
                "-vf", "select=eq(n\\,0)", "-frames:v", "1",
                str(frame_path),
            ], capture_output=True, timeout=30)
        except Exception:
            return None
        if frame_path.exists():
            return ocr_image(str(frame_path), job_dir)

    return None


def ocr_image(image_path, job_dir):
    """Run Tesseract OCR on an image file."""
    try:
        result = subprocess.run(
            ["tesseract", str(image_path), "stdout"],
            capture_output=True, text=True, timeout=30,
        )
        text = result.stdout.strip()
        if not text:
            return None

        ocr_path = job_dir / "ocr_text.txt"
        with open(ocr_path, "w") as f:
            f.write(text)

        word_count = len(text.split())
        return {
            "type": "ocr",
            "filename": "ocr_text.txt",
            "label": "OCR / Text Extraction",
            "detail": f"TXT • {word_count} words • {format_size(ocr_path.stat().st_size)}",
            "icon": "📝",
        }
    except FileNotFoundError:
        return None
    except Exception:
        return None


def ocr_pdf(pdf_path, job_dir):
    """Extract text from PDF using pdf2image + Tesseract, or pdftotext."""
    try:
        result = subprocess.run(
            ["pdftotext", str(pdf_path), "-"],
            capture_output=True, text=True, timeout=30,
        )
        text = result.stdout.strip()
        if text:
            ocr_path = job_dir / "ocr_text.txt"
            with open(ocr_path, "w") as f:
                f.write(text)
            word_count = len(text.split())
            return {
                "type": "ocr",
                "filename": "ocr_text.txt",
                "label": "OCR / Text Extraction",
                "detail": f"TXT • {word_count} words • {format_size(ocr_path.stat().st_size)}",
                "icon": "📝",
            }
    except Exception:
        pass
    return None


def cleanup_old_outputs():
    cutoff = time.time() - 86400
    for d in OUTPUT_DIR.iterdir():
        if d.is_dir() and d.stat().st_mtime < cutoff:
            shutil.rmtree(d, ignore_errors=True)
    for jid in list(jobs.keys()):
        if jobs[jid].get("created", 0) < cutoff:
            del jobs[jid]


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8099, debug=True)
