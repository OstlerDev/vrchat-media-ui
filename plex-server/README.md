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
- `GET /stream/movies/:plexId/:segment.ts` – cached HLS segment for that Plex id
- `GET /health` – readiness indicator

### Streaming model
- On the first request for a Plex id, the server remuxes the entire movie into a VOD-style HLS playlist inside `STREAM_CACHE_DIR/<plexId>`. The HTTP request blocks until the playlist is ready so players can immediately see the total duration and remaining time.
- Subsequent viewers reuse the cached playlist/segments instead of spawning new ffmpeg processes, allowing many users around the world to watch the same title concurrently.
- Cached artifacts persist on disk until you delete them (manually or via external cleanup).

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
| `HLS_WINDOW_SEGMENTS` | Playlist length (# of segments, use `0` for full VOD) | `0` |
| `VIDEO_CODEC` | ffmpeg `-c:v` value | `copy` |
| `VIDEO_PROFILE` | ffmpeg `-profile:v` value for video transcode | _unset_ |
| `VIDEO_BITRATE` | ffmpeg `-b:v` value (ignored when codec=`copy`) | `3500k` |
| `AUDIO_CODEC` | ffmpeg `-c:a` value | `copy` |
| `AUDIO_BITRATE` | ffmpeg `-b:a` (ignored when codec=`copy`) | `128k` |
| `STREAM_CACHE_DIR` | Directory for transient `.m3u8` + segment files | `.streams` |

## Docker
```
docker build -t plex-server .
docker run --env-file .env -p 4000:4000 plex-server
```

When running in Docker, remember to set `PLEX_BASE_URL` to an address reachable from inside the container (e.g. host.docker.internal on macOS).

HLS playlists and transport stream segments are written to `STREAM_CACHE_DIR/<plexId>` and reused for subsequent viewers. Clean the directory manually when you want to reclaim disk space. By default only the primary video/audio streams are mapped and subtitle/data tracks are dropped to avoid muxing errors; adjust the ffmpeg flags in `services/vodCache.js` if you need alternate behavior.
