# VideoClipFlow backend - Flask + yt-dlp + ffmpeg + Whisper
FROM python:3.11-slim-bookworm

# Install ffmpeg (required for audio/video extraction)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create dirs for uploads/outputs
RUN mkdir -p uploads outputs

ENV PORT=8099
EXPOSE 8099

COPY entrypoint.sh .
RUN chmod +x entrypoint.sh
ENTRYPOINT ["./entrypoint.sh"]
