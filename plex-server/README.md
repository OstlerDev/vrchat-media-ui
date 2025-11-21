# plex-server

Streaming gateway that proxies Plex media into locally generated HLS streams for `vrchat-video-ui`.

## Prerequisites
- Node.js 20+
- A reachable Plex server with a valid `PLEX_TOKEN`
- `ffmpeg` (bundled automatically through `@ffmpeg-installer/ffmpeg`, override via `FFMPEG_PATH` if needed)

## Getting started
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the example environment and update the values:
   ```bash
   cp .env.example .env
   ```
3. Start the server:
   ```bash
   npm run dev
   ```

The service exposes:
- `GET /stream/movies/:plexId.m3u8` – playlist for a given Plex metadata id
- `GET /stream/movies/:plexId/:segment.ts` – HLS segment proxy for active sessions
- `GET /health` – readiness indicator

## Environment variables
| Name | Description | Default |
| ---- | ----------- | ------- |
| `PLEX_BASE_URL` | Base URL to your Plex server (e.g. `http://192.168.1.10:32400`) | _required_ |
| `PLEX_TOKEN` | Plex auth token used for API + media fetches | _required_ |
| `PORT` | HTTP port for plex-server | `4000` |
| `FFMPEG_PATH` | Override path to ffmpeg binary | bundled binary |
| `FFMPEG_MAX_DELAY` | Max input buffering delay passed to ffmpeg (µs) | `50000` |
| `FFMPEG_PROBESIZE` | ffmpeg `-probesize` value for stream detection | `20000000` |
| `FFMPEG_ANALYZE_DURATION` | ffmpeg `-analyzeduration` value | `20000000` |
| `HLS_SEGMENT_DURATION` | Seconds per generated segment | `4` |
| `HLS_WINDOW_SEGMENTS` | Playlist length (# of segments) | `6` |
| `SESSION_TTL_MS` | Idle timeout before tearing down ffmpeg (ms) | `600000` |
| `VIDEO_CODEC` | ffmpeg `-c:v` value | `libx264` |
| `VIDEO_PROFILE` | ffmpeg `-profile:v` value for video transcode | `baseline` |
| `VIDEO_BITRATE` | ffmpeg `-b:v` value (ignored when codec=`copy`) | `3500k` |
| `AUDIO_CODEC` | ffmpeg `-c:a` value | `aac` |
| `AUDIO_BITRATE` | ffmpeg `-b:a` (ignored when codec=`copy`) | `128k` |
| `STREAM_CACHE_DIR` | Directory for transient `.m3u8` + segment files | `.streams` |

## Docker
```
docker build -t plex-server .
docker run --env-file .env -p 4000:4000 plex-server
```

When running in Docker, remember to set `PLEX_BASE_URL` to an address reachable from inside the container (e.g. host.docker.internal on macOS).

HLS playlists and transport stream segments are written to `STREAM_CACHE_DIR` per Plex ID while ffmpeg is running and are deleted automatically when the session expires or the process shuts down. Make sure the directory is writable in your deployment environment (bind-mount or use a tmpfs when containerized). By default only the primary video/audio streams are mapped and subtitle/data tracks are dropped to avoid muxing errors; adjust the ffmpeg flags in `services/streamSession.js` if you need alternate behavior.
