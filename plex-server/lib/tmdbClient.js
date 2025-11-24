const axios = require('axios');

const createTmdbClient = ({ env, logger }) => {
  if (!env.tmdbApiReadToken) {
    return {
      isEnabled: false,
      find: async () => {
        logger.warn('TMDb environment variable missing. Skipping TMDb integration.');
        return null;
      }
    };
  }

  const http = axios.create({
    baseURL: 'https://api.themoviedb.org/3',
    headers: {
      'Authorization': `Bearer ${env.tmdbApiReadToken}`,
      'Accept': 'application/json',
    },
    timeout: 15000,
  });

  const findByExternalId = async (externalId, externalSource = 'imdb_id') => {
    try {
      const { data } = await http.get(`/find/${externalId}`, {
        params: { external_source: externalSource }
      });

      // Check for results in order of preference: movie, tv
      if (data.movie_results && data.movie_results.length > 0) {
        const result = data.movie_results[0];
        return { id: result.id, mediaType: 'movie', ...result };
      }
      
      if (data.tv_results && data.tv_results.length > 0) {
        const result = data.tv_results[0];
        return { id: result.id, mediaType: 'tv', ...result };
      }

      return null;
    } catch (err) {
      logger.error({ err, externalId }, 'Failed to find media in TMDb');
      throw err;
    }
  };

  return {
    isEnabled: true,
    findByExternalId,
  };
};

module.exports = { createTmdbClient };

