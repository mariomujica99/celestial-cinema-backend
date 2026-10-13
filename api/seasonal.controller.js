import seasonalConfig from './seasonal.config.js';
import MoviesController from './movies.controller.js';

const SEASON_RAIL_CACHE_MS = 6 * 60 * 60 * 1000; // 6 hours
const SEASON_HERO_CACHE_MS = 6 * 60 * 60 * 1000; // 6 hours
const SEASON_POOL_CACHE_MS = 24 * 60 * 60 * 1000; // 24 hours
const SEASON_EPISODES_CACHE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const RAIL_RESULT_LIMIT = 20; // Request a few more than needed to account for dedupe
const MIN_VOTE_COUNT_MOVIE = 50;
const MIN_VOTE_COUNT_TV = 20;
const HERO_CANDIDATES_PER_TYPE = 8;
const HERO_SLIDE_LIMIT = 8;

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
        () => SeasonalController.loadHeroSlides(season, seasonData)
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

      if (rail.isEpisodeRail) {
        return res.status(400).json({ error: `Rail '${railKey}' does not support pagination` });
      }

      const keywordIds = SeasonalController.getResolvedKeywords(season, seasonData);
      const endpoint = rail.isNewThisYear
        ? SeasonalController.buildNewThisYearEndpoint(
            mediaType, SeasonalController.getBaseFilter(seasonData, mediaType), keywordIds, SeasonalController.getNewThisYear(), page
          )
        : SeasonalController.buildDiscoverEndpoint(
            mediaType, mediaType === 'movie' ? rail.movieFilter : rail.tvFilter, keywordIds, page
          );

      const data = await SeasonalController.getCachedDiscover(`seasonal-rail-${season}-${railKey}-${mediaType}-${page}`, endpoint);
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
        SeasonalController.getResolvedKeywords(season, seasonData),
        page
      );

      const data = await SeasonalController.getCachedDiscover(`seasonal-streaming-${season}-${providerId}-${mediaType}-${page}`, endpoint);
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

      const endpoint = SeasonalController.buildNewThisYearEndpoint(
        mediaType,
        baseFilter,
        SeasonalController.getResolvedKeywords(season, seasonData),
        SeasonalController.getNewThisYear(),
        page
      );

      const data = await SeasonalController.getCachedDiscover(`seasonal-new-${season}-${mediaType}-${page}`, endpoint);
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

  /**
   * resolveKeywords.js prints its output keyed by season; pick this season's map.
   */
  static getResolvedKeywords(season, seasonData) {
    return seasonData.resolvedKeywords?.[season] || {};
  }

  static getBaseFilter(seasonData, mediaType) {
    return mediaType === 'movie' ? seasonData.streamingBase.movies : seasonData.streamingBase.tv;
  }

  /**
   * In January, "New This Year" uses the year that just ended.
   */
  static getNewThisYear() {
    const now = new Date();
    return now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  }

  static getCachedDiscover(cacheKey, endpoint) {
    return MoviesController.getCached(
      cacheKey,
      SEASON_RAIL_CACHE_MS,
      () => MoviesController.makeAPICall(endpoint)
    );
  }

  /**
   * Hero candidates: the season's most popular movies and shows, interleaved
   * so both types appear, then reduced to slides that have a trailer + backdrop.
   */
  static async loadHeroSlides(season, seasonData) {
    const keywordIds = SeasonalController.getResolvedKeywords(season, seasonData);
    const [movieData, tvData] = await Promise.all(['movie', 'tv'].map(mediaType =>
      MoviesController.makeAPICall(SeasonalController.buildDiscoverEndpoint(
        mediaType, SeasonalController.getBaseFilter(seasonData, mediaType), keywordIds, 1
      ))
    ));

    const toCandidates = (data, mediaType) => (data.results || [])
      .slice(0, HERO_CANDIDATES_PER_TYPE)
      .map(item => ({ id: item.id, media_type: mediaType }));
    const movieCandidates = toCandidates(movieData, 'movie');
    const tvCandidates = toCandidates(tvData, 'tv');
    const candidates = movieCandidates.flatMap((movie, index) => [movie, tvCandidates[index]].filter(Boolean));

    const settledSlides = await Promise.allSettled(
      candidates.map(item => MoviesController.fetchHeroSlide(item))
    );
    return MoviesController.collectFulfilledValues(settledSlides).slice(0, HERO_SLIDE_LIMIT);
  }

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
   * Builds a with_keywords value. IDs inside one group are OR (pipe).
   * Groups are OR-ed (pipe) by default, or AND-ed (comma) when keywordOp is 'AND'.
   * AND fails closed: an unresolved group throws instead of silently dropping the requirement.
   */
  static buildKeywordClause(keywordGroups, keywordOp, resolvedKeywords) {
    if (!keywordGroups || keywordGroups.length === 0) return '';
    const groupNames = typeof keywordGroups === 'string' ? [keywordGroups] : keywordGroups;
    const groupClauses = groupNames.map(groupName => (resolvedKeywords[groupName] || []).join('|'));

    if (keywordOp !== 'AND') return groupClauses.filter(Boolean).join('|');
    if (groupClauses.some(clause => !clause)) {
      throw new Error(`Unresolved keyword group in AND filter: ${groupNames.join(', ')}`);
    }
    return groupClauses.join(',');
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
      // Keywords: groups are OR-ed by default, or AND-ed when keywordOp is 'AND'
      const keywordClause = SeasonalController.buildKeywordClause(filter.keywords, filter.keywordOp, resolvedKeywords);
      if (keywordClause) params.push(`with_keywords=${keywordClause}`);
    }

    // Keyword exclusions (TV-only rails): group names resolve to IDs sent as without_keywords
    if (filter.keywordExclusions && filter.keywordExclusions.length > 0) {
      const excludedKeywordIds = SeasonalController.expandKeywordGroups(filter.keywordExclusions, resolvedKeywords);
      if (excludedKeywordIds.length > 0) {
        params.push(`without_keywords=${excludedKeywordIds.join('|')}`);
      }
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