const path = require('path');
const dotenv = require('dotenv');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');

const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const resolvePath = (maybePath, fallback) => {
  if (maybePath) {
    return path.resolve(maybePath);
  }
  return path.resolve(__dirname, fallback);
};

const parseNumber = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getRequired = (key) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable ${key}`);
  }
  return value;
};

const env = {
  port: parseNumber(process.env.PORT, 4000),
  plexBaseUrl: getRequired('PLEX_BASE_URL').replace(/\/+$/, ''),
  plexToken: getRequired('PLEX_TOKEN'),
  ffmpegPath: process.env.FFMPEG_PATH || ffmpegInstaller.path,
  ffmpegLogLevel: process.env.FFMPEG_LOG_LEVEL || 'error',
  ffmpegPreset: process.env.FFMPEG_PRESET,
  ffmpegCrf: process.env.FFMPEG_CRF,
  ffmpegMaxDelay: parseNumber(process.env.FFMPEG_MAX_DELAY, 50_000),
  ffmpegProbeSize: parseNumber(process.env.FFMPEG_PROBESIZE, 20_000_000),
  ffmpegAnalyzeDuration: parseNumber(process.env.FFMPEG_ANALYZE_DURATION, 20_000_000),
  hlsSegmentDuration: parseNumber(process.env.HLS_SEGMENT_DURATION, 4),
  hlsWindowSegments: parseNumber(process.env.HLS_WINDOW_SEGMENTS, 0),
  videoCodec: process.env.VIDEO_CODEC || 'copy',
  videoProfile: process.env.VIDEO_PROFILE,
  audioCodec: process.env.AUDIO_CODEC || 'copy',
  videoBitrate: process.env.VIDEO_BITRATE || '3500k',
  audioBitrate: process.env.AUDIO_BITRATE || '128k',
  streamCacheDir: resolvePath(process.env.STREAM_CACHE_DIR, '../.streams'),
};

module.exports = { env };
