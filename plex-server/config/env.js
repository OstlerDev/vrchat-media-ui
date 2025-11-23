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
  ffmpegPreset: process.env.FFMPEG_PRESET || 'veryfast',
  ffmpegCrf: process.env.FFMPEG_CRF || 23,
  videoCodec: process.env.VIDEO_CODEC || 'libx264',
  videoProfile: process.env.VIDEO_PROFILE || 'high',
  audioCodec: process.env.AUDIO_CODEC || 'aac',
  videoBitrate: process.env.VIDEO_BITRATE || '3500k',
  audioBitrate: process.env.AUDIO_BITRATE || '128k',
  streamCacheDir: resolvePath(process.env.STREAM_CACHE_DIR, '../.streams'),
};

module.exports = { env };
