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

  const search = async (query) => {
    try {
      const { data } = await http.get('/hubs/search', {
        params: { query, limit: 30 }
      });
      const hubs = data?.MediaContainer?.Hub || [];
      const results = [];
      for (const hub of hubs) {
        if (hub.type === 'movie' || hub.type === 'show') {
          if (hub.Metadata) {
            results.push(...hub.Metadata);
          }
        }
      }
      return results;
    } catch (error) {
      logger.error({ err: error, query }, 'Failed to search Plex');
      return [];
    }
  };

  const getRecentlyAdded = async () => {
    try {
      const { data } = await http.get('/library/recentlyAdded', {
        params: { limit: 30 }
      });
      return data?.MediaContainer?.Metadata || [];
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch recently added');
      return [];
    }
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

  const getAssetStream = async (relativePath) => {
    try {
      const response = await http.get(relativePath, {
        responseType: 'stream'
      });
      return response;
    } catch (error) {
      logger.error({ err: error, path: relativePath }, 'Failed to fetch asset stream');
      throw error;
    }
  };

  return {
    getMetadata,
    getPrimaryPartStreamUrl,
    getAssetStream,
    search,
    getRecentlyAdded,
  };
};

module.exports = { createPlexClient };
