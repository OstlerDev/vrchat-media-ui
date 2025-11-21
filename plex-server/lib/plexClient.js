const axios = require('axios');

const createPlexClient = ({ env, logger }) => {
  if (!env?.plexBaseUrl || !env?.plexToken) {
    throw new Error('Plex client requires plexBaseUrl and plexToken');
  }

  const http = axios.create({
    baseURL: env.plexBaseUrl,
    timeout: 15_000,
    params: { 'X-Plex-Token': env.plexToken },
  });

  const normalizeUrl = (maybeAbsolute) => {
    if (!maybeAbsolute) {
      throw new Error('Plex part is missing playback URL');
    }

    if (maybeAbsolute.startsWith('http')) {
      const target = new URL(maybeAbsolute);
      if (!target.searchParams.has('X-Plex-Token')) {
        target.searchParams.set('X-Plex-Token', env.plexToken);
      }
      return target.toString();
    }

    const base = new URL(env.plexBaseUrl);
    const target = new URL(maybeAbsolute, base);
    target.searchParams.set('X-Plex-Token', env.plexToken);
    return target.toString();
  };

  const getMetadata = async (plexId) => {
    try {
      const { data } = await http.get(`/library/metadata/${plexId}`);
      const metadata = data?.MediaContainer?.Metadata?.[0];
      if (!metadata) {
        throw new Error('Media not found');
      }
      return metadata;
    } catch (error) {
      logger.error({ err: error, plexId }, 'Failed to fetch metadata');
      throw error;
    }
  };

  const getPrimaryPartStreamUrl = async (plexId) => {
    const metadata = await getMetadata(plexId);
    const media = metadata.Media?.[0];
    const part = media?.Part?.[0];

    if (!part?.key && !part?.file) {
      throw new Error('Unable to resolve Plex media part');
    }

    return normalizeUrl(part.key || part.file);
  };

  return {
    getMetadata,
    getPrimaryPartStreamUrl,
  };
};

module.exports = { createPlexClient };
