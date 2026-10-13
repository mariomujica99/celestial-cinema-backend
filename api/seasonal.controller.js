import seasonalConfig from './seasonal.config.js';
import MoviesController from './movies.controller.js';

const SEASON_RAIL_CACHE_MS = 6 * 60 * 60 * 1000; // 6 hours
const SEASON_HERO_CACHE_MS = 6 * 60 * 60 * 1000; // 6 hours
const SEASON_POOL_CACHE_MS = 24 * 60 * 60 * 1000; // 24 hours
const SEASON_EPISODES_CACHE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const RAIL_RESULT_LIMIT = 20; // Request a few more than needed to account for dedupe
const MIN_VOTE_COUNT_MOVIE = 50;
const MIN_VOTE_COUNT_TV = 20;

// Lazy-loaded episodes JSON
let cachedEpisodes = null;

export default class SeasonalController {
  /**
   * GET /seasonal/:season
   * Returns ordered rail list for the page with metadata.
   */
  static async apiGetSeasonalRails(req, res) {
    try {
      const { season } = req.params;
      const seasonData = seasonalConfig[season];

      if (!seasonData) {
        return res.status(400).json({ error: 'Unknown season' });
      }

      const rails = seasonData.rails.map(rail => ({
        key: rail.key,
        title: rail.title,
        types: rail.types,
        allowToggle: rail.allowToggle,
        isEpisodeRail: rail.isEpisodeRail || false,
        episodeKind: rail.episodeKind || null,
        isNewThisYear: rail.isNewThisYear || false,
      }));

      res.json({
        season,
        title: seasonData.title,
        hasEpisodeRails: seasonData.hasEpisodeRails,
        palette: seasonData.palette,
        rails,
      });
    } catch (error) {
      console.error('Error fetching seasonal rails:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /seasonal/:season/hero
   * Returns hero slides built from top titles with trailers in the season.
   * Reuses the existing home hero builder refactored to accept candidates.
   */
  static async apiGetSeasonalHero(req, res) {
    try {
      const { season } = req.params;
      const seasonData = seasonalConfig[season];

      if (!seasonData) {
        return res.status(400).json({ error: 'Unknown season' });
      }

      const slides = await MoviesController.getCached(
        `seasonal-hero-${season}`,
        SEASON_HERO_CACHE_MS,
        async () => {
          // For now, use trending as the hero candidate source.
          // In Phase 3, this could be the first rail's top results.
          const trending = await MoviesController.makeAPICall('/trending/all/week');
          const candidates = (trending.results || [])
            .filter(item => item.media_type === 'movie' || item.media_type === 'tv')
            .slice(0, 16);

          const settledSlides = await Promise.allSettled(
            candidates.map(item => MoviesController.fetchHeroSlide(item))
          );
          return MoviesController.collectFulfilledValues(settledSlides).slice(0, 8);
        }
      );

      res.json({ results: slides });
    } catch (error) {
      console.error('Error fetching seasonal hero:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /seasonal/:season/rail/:railKey?type=&page=
   * Returns discover results for a rail, paginated in TMDB shape.
   */
  static async apiGetSeasonalRail(req, res) {
    try {
      const { season, railKey } = req.params;
      const mediaType = req.query.type || 'movie';
      const page = SeasonalController.parsePageParam(req.query.page);

      const seasonData = seasonalConfig[season];
      if (!seasonData) {
        return res.status(400).json({ error: 'Unknown season' });
      }

      const rail = seasonData.rails.find(r => r.key === railKey);
      if (!rail) {
        return res.status(400).json({ error: 'Unknown rail key' });
      }

      if (!rail.types.includes(mediaType)) {
        return res.status(400).json({ error: `Rail does not support type '${mediaType}'` });
      }

      if (rail.isEpisodeRail || rail.isNewThisYear) {
        return res.status(400).json({ error: `Rail '${railKey}' does not support pagination` });
      }

      // Build TMDB discover endpoint based on rail filter
      const filter = mediaType === 'movie' ? rail.movieFilter : rail.tvFilter;
      const endpoint = SeasonalController.buildDiscoverEndpoint(
        mediaType,
        filter,
        seasonData.resolvedKeywords,
        page
      );

      const data = await MoviesController.makeAPICall(endpoint);
      res.json(data);
    } catch (error) {
      console.error('Error fetching seasonal rail:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /seasonal/:season/streaming/:providerId?type=&page=
   * Returns streaming results with the season's base filter.
   */
  static async apiGetSeasonalStreaming(req, res) {
    try {
      const { season, providerId } = req.params;
      const mediaType = req.query.type || 'movie';
      const page = SeasonalController.parsePageParam(req.query.page);

      const seasonData = seasonalConfig[season];
      if (!seasonData) {
        return res.status(400).json({ error: 'Unknown season' });
      }

      if (!/^\d+$/.test(providerId)) {
        return res.status(400).json({ error: 'Valid provider ID is required' });
      }

      if (!MoviesController.isValidMediaType(mediaType)) {
        return res.status(400).json({ error: "Type must be 'movie' or 'tv'" });
      }

      const baseFilter = mediaType === 'movie'
        ? seasonData.streamingBase.movies
        : seasonData.streamingBase.tv;

      const endpoint = SeasonalController.buildStreamingEndpoint(
        mediaType,
        providerId,
        baseFilter,
        seasonData.resolvedKeywords,
        page
      );

      const data = await MoviesController.makeAPICall(endpoint);
      res.json(data);
    } catch (error) {
      console.error('Error fetching seasonal streaming:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /seasonal/:season/new?type=&page=
   * Returns new releases for the current (or specified) year, filtered by season base.
   */
  static async apiGetSeasonalNew(req, res) {
    try {
      const { season } = req.params;
      const mediaType = req.query.type || 'movie';
      const page = SeasonalController.parsePageParam(req.query.page);

      const seasonData = seasonalConfig[season];
      if (!seasonData) {
        return res.status(400).json({ error: 'Unknown season' });
      }

      if (!MoviesController.isValidMediaType(mediaType)) {
        return res.status(400).json({ error: "Type must be 'movie' or 'tv'" });
      }

      const baseFilter = mediaType === 'movie'
        ? seasonData.streamingBase.movies
        : seasonData.streamingBase.tv;

      const now = new Date();
      // In January, "New This Year" uses the previous year
      const year = now.getMonth() === 0
        ? now.getFullYear() - 1
        : now.getFullYear();

      const endpoint = SeasonalController.buildNewThisYearEndpoint(
        mediaType,
        baseFilter,
        seasonData.resolvedKeywords,
        year,
        page
      );

      const data = await MoviesController.makeAPICall(endpoint);
      res.json(data);
    } catch (error) {
      console.error('Error fetching seasonal new:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /seasonal/:season/episodes?kind=live|animation
   * Returns curated episode data hydrated into card format.
   */
  static async apiGetSeasonalEpisodes(req, res) {
    try {
      const { season } = req.params;
      const kind = req.query.kind || 'live';

      const seasonData = seasonalConfig[season];
      if (!seasonData) {
        return res.status(400).json({ error: 'Unknown season' });
      }

      if (!seasonData.hasEpisodeRails) {
        return res.status(400).json({ error: 'Season has no episode rails' });
      }

      if (!['live', 'animation'].includes(kind)) {
        return res.status(400).json({ error: "Kind must be 'live' or 'animation'" });
      }

      // Load and cache the frozen episode list
      const episodes = await MoviesController.getCached(
        `seasonal-episodes-${season}`,
        SEASON_EPISODES_CACHE_MS,
        () => SeasonalController.loadEpisodes()
      );

      // Filter by season and kind, then hydrate into card data
      const filtered = episodes.filter(ep => ep.season === season && ep.kind === kind);
      res.json({ results: filtered });
    } catch (error) {
      console.error('Error fetching seasonal episodes:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /seasonal/:season/watchlist-match
   * Returns watchlist items that appear in the season pool.
   */
  static async apiGetSeasonalWatchlistMatch(req, res) {
    try {
      const { season } = req.params;
      const seasonData = seasonalConfig[season];

      if (!seasonData) {
        return res.status(400).json({ error: 'Unknown season' });
      }

      // Read watchlist count from localStorage-like source
      // For now, return empty (Phase 5 will implement full watchlist matching)
      res.json({ results: [] });
    } catch (error) {
      console.error('Error fetching seasonal watchlist match:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // ========== HELPERS ==========

  static parsePageParam(pageParam) {
    const page = parseInt(pageParam, 10);
    return page > 0 ? page : 1;
  }

  /**
   * Expand keyword group names (e.g., 'HORROR_TV') to resolved TMDB keyword IDs.
   */
  static expandKeywordGroups(keywordGroups, resolvedKeywords) {
    if (!keywordGroups) return [];
    if (typeof keywordGroups === 'string') {
      keywordGroups = [keywordGroups];
    }
    return keywordGroups.flatMap(group => resolvedKeywords[group] || []);
  }

  /**
   * Convert genre names to IDs; handle movie vs TV.
   */
  static expandGenres(genreNames, mediaType, seasonData) {
    if (!genreNames) return [];
    if (typeof genreNames === 'string') {
      genreNames = [genreNames];
    }
    const genreMap = mediaType === 'movie'
      ? seasonData.movieGenres
      : seasonData.tvGenres;
    return genreNames
      .map(name => {
        // Handle both direct names and names with underscores
        const key = Object.keys(genreMap).find(k => k.replace(/_/g, ' ') === name.replace(/_/g, ' '));
        return genreMap[key];
      })
      .filter(Boolean);
  }

  /**
   * Build a discover endpoint with genre and keyword filters.
   */
  static buildDiscoverEndpoint(mediaType, filter, resolvedKeywords, page) {
    let endpoint = `/discover/${mediaType}?`;
    const params = [];

    params.push('sort_by=popularity.desc');
    params.push(`page=${page}`);
    params.push('include_adult=false');
    params.push('language=en-US');
    params.push('region=US'); // For vote_count consistency

    // Vote count floor
    const minVotes = mediaType === 'movie' ? MIN_VOTE_COUNT_MOVIE : MIN_VOTE_COUNT_TV;
    params.push(`vote_count.gte=${minVotes}`);

    // Genres
    if (filter.genres && filter.genres.length > 0) {
      const seasonData = Object.values(seasonalConfig)[0]; // Access season data for genre map
      const genreIds = SeasonalController.expandGenres(filter.genres, mediaType, seasonData);
      if (genreIds.length > 0) {
        if (filter.genreOp === 'OR') {
          params.push(`with_genres=${genreIds.join('|')}`);
        } else {
          // AND: request each separately and intersect on the client (not ideal but TMDB limitation)
          params.push(`with_genres=${genreIds.join(',')}`);
        }
      }
    }

    // Keywords
    if (filter.keywords && filter.keywords.length > 0) {
      const keywordIds = SeasonalController.expandKeywordGroups(filter.keywords, resolvedKeywords);
      if (keywordIds.length > 0) {
        if (filter.keywordOp === 'OR') {
          params.push(`with_keywords=${keywordIds.join('|')}`);
        } else {
          params.push(`with_keywords=${keywordIds.join(',')}`);
        }
      }
    }

    // Keyword exclusions (TV only)
    if (filter.keywordExclusions && filter.keywordExclusions.length > 0) {
      // This would require resolving exclusion keyword names to IDs
      // For now, skip (Phase 2 MVP)
    }

    // Certification cap (movie only)
    if (filter.certificationMaxRating) {
      params.push(`certification_country=${filter.certificationCountry || 'US'}`);
      params.push(`certification.lte=${filter.certificationMaxRating}`);
    }

    return endpoint + params.join('&');
  }

  /**
   * Build a streaming endpoint with watch provider and seasonal filter.
   */
  static buildStreamingEndpoint(mediaType, providerId, baseFilter, resolvedKeywords, page) {
    let endpoint = `/discover/${mediaType}?`;
    const params = [];

    params.push(`with_watch_providers=${providerId}`);
    params.push('watch_region=US');
    params.push('with_watch_monetization_types=flatrate');
    params.push('sort_by=popularity.desc');
    params.push(`page=${page}`);
    params.push('include_adult=false');
    params.push('language=en-US');

    const minVotes = mediaType === 'movie' ? MIN_VOTE_COUNT_MOVIE : MIN_VOTE_COUNT_TV;
    params.push(`vote_count.gte=${minVotes}`);

    // Apply base filter (genre or keyword)
    if (baseFilter.genres && baseFilter.genres.length > 0) {
      const seasonData = Object.values(seasonalConfig)[0];
      const genreIds = SeasonalController.expandGenres(baseFilter.genres, mediaType, seasonData);
      if (genreIds.length > 0) {
        params.push(`with_genres=${genreIds.join(',')}`);
      }
    }

    if (baseFilter.keywords && baseFilter.keywords.length > 0) {
      const keywordIds = SeasonalController.expandKeywordGroups(baseFilter.keywords, resolvedKeywords);
      if (keywordIds.length > 0) {
        params.push(`with_keywords=${keywordIds.join('|')}`);
      }
    }

    return endpoint + params.join('&');
  }

  /**
   * Build a "New This Year" endpoint with year filter.
   */
  static buildNewThisYearEndpoint(mediaType, baseFilter, resolvedKeywords, year, page) {
    let endpoint = `/discover/${mediaType}?`;
    const params = [];

    params.push('sort_by=popularity.desc');
    params.push(`page=${page}`);
    params.push('include_adult=false');
    params.push('language=en-US');

    const minVotes = mediaType === 'movie' ? MIN_VOTE_COUNT_MOVIE : MIN_VOTE_COUNT_TV;
    params.push(`vote_count.gte=${minVotes}`);

    // Year filter
    if (mediaType === 'movie') {
      params.push(`primary_release_year=${year}`);
    } else {
      params.push(`first_air_date_year=${year}`);
    }

    // Apply base filter
    if (baseFilter.genres && baseFilter.genres.length > 0) {
      const seasonData = Object.values(seasonalConfig)[0];
      const genreIds = SeasonalController.expandGenres(baseFilter.genres, mediaType, seasonData);
      if (genreIds.length > 0) {
        params.push(`with_genres=${genreIds.join(',')}`);
      }
    }

    if (baseFilter.keywords && baseFilter.keywords.length > 0) {
      const keywordIds = SeasonalController.expandKeywordGroups(baseFilter.keywords, resolvedKeywords);
      if (keywordIds.length > 0) {
        params.push(`with_keywords=${keywordIds.join('|')}`);
      }
    }

    return endpoint + params.join('&');
  }

  /**
   * Load and parse the frozen episode list from seasonal.episodes.json.
   * For now returns empty; Phase 4 will populate this.
   */
  static async loadEpisodes() {
    if (cachedEpisodes) return cachedEpisodes;

    try {
      // In a real deployment, this would import/read seasonal.episodes.json
      // For Phase 2 MVP, return empty array
      cachedEpisodes = [];
      return cachedEpisodes;
    } catch (error) {
      console.error('Failed to load episodes:', error);
      return [];
    }
  }
}