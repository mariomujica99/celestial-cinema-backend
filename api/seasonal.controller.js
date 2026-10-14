import seasonalConfig from './seasonal.config.js';
import MoviesController from './movies.controller.js';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FROZEN_EPISODES_PATH = path.join(__dirname, 'seasonal.episodes.json');
const SEASON_RAIL_CACHE_MS = 6 * 60 * 60 * 1000; // 6 hours
const SEASON_HERO_CACHE_MS = 6 * 60 * 60 * 1000; // 6 hours
const SEASON_POOL_CACHE_MS = 24 * 60 * 60 * 1000; // 24 hours
const SEASON_EPISODES_CACHE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const RAIL_RESULT_LIMIT = 20; // Request a few more than needed to account for dedupe
const MIN_VOTE_COUNT_MOVIE = 50;
const MIN_VOTE_COUNT_TV = 20;
const HERO_CANDIDATES_PER_TYPE = 8;
const HERO_SLIDE_LIMIT = 8;
const HERO_TRENDING_WINDOW = 'week';
const HERO_TRENDING_SCAN_PAGES = 3; // 60 trending titles per media type
const KEYWORD_CACHE_MS = 24 * 60 * 60 * 1000; // 24 hours

// Lazy-loaded frozen episodes (api/seasonal.episodes.json)
let cachedFrozenEpisodes = null;

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
   * GET /seasonal/:season/episodes
   * Returns the frozen approved episodes for the season, hydrated into card data.
   */
  static async apiGetSeasonalEpisodes(req, res) {
    try {
      const { season } = req.params;

      const seasonData = seasonalConfig[season];
      if (!seasonData) {
        return res.status(400).json({ error: 'Unknown season' });
      }

      if (!seasonData.hasEpisodeRails) {
        return res.status(400).json({ error: 'Season has no episode rails' });
      }

      const results = await SeasonalController.hydrateEpisodes(season);
      res.json({ results });
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
   * Hero slides: the season's most trending titles, interleaved movie/TV, then reduced to slides
   * that have a trailer and backdrop.
   */
  static async loadHeroSlides(season, seasonData) {
    const keywordIds = SeasonalController.getResolvedKeywords(season, seasonData);
    const [movieCandidates, tvCandidates] = await Promise.all(['movie', 'tv'].map(mediaType =>
      SeasonalController.findTrendingCandidates(mediaType, seasonData, keywordIds)
    ));
    const candidates = SeasonalController.interleave(movieCandidates, tvCandidates);

    const settledSlides = await Promise.allSettled(
      candidates.map(item => MoviesController.fetchHeroSlide(item))
    );
    return MoviesController.collectFulfilledValues(settledSlides).slice(0, HERO_SLIDE_LIMIT);
  }

  static interleave(first, second) {
    const longest = Math.max(first.length, second.length);
    return Array.from({ length: longest }, (_, index) => [first[index], second[index]])
      .flat()
      .filter(Boolean);
  }

  /**
   * Trending titles for one media type that match the season's base filter, most trending first.
   */
  static async findTrendingCandidates(mediaType, seasonData, keywordIds) {
    const filter = SeasonalController.getBaseFilter(seasonData, mediaType);
    const matches = [];
    for (let page = 1; page <= HERO_TRENDING_SCAN_PAGES && matches.length < HERO_CANDIDATES_PER_TYPE; page++) {
      const trending = await SeasonalController.getCachedTrending(mediaType, page);
      for (const item of trending.results || []) {
        if (matches.length >= HERO_CANDIDATES_PER_TYPE) {
          break;
        }
        if (await SeasonalController.matchesSeasonFilter(item, { mediaType, filter, seasonData, keywordIds })) {
          matches.push({ id: item.id, media_type: mediaType });
        }
      }
    }
    return matches;
  }

  /**
   * Checks a trending item against the season's base filter the way discover does: every genre must
   * match, and any keyword group may match. Keywords are only looked up when the genre check passes.
   */
  static async matchesSeasonFilter(item, { mediaType, filter, seasonData, keywordIds }) {
    if (filter.genres?.length) {
      const genreIds = SeasonalController.expandGenres(filter.genres, mediaType, seasonData);
      if (!genreIds.every(id => item.genre_ids?.includes(id))) {
        return false;
      }
    }
    if (filter.keywords?.length) {
      const wantedIds = SeasonalController.expandKeywordGroups(filter.keywords, keywordIds);
      const itemKeywordIds = await SeasonalController.getCachedKeywordIds(mediaType, item.id);
      if (!wantedIds.some(id => itemKeywordIds.includes(id))) {
        return false;
      }
    }
    return true;
  }

  static getCachedTrending(mediaType, page) {
    return MoviesController.getCached(
      `trending-${mediaType}-${HERO_TRENDING_WINDOW}-${page}`,
      SEASON_HERO_CACHE_MS,
      () => MoviesController.makeAPICall(`/trending/${mediaType}/${HERO_TRENDING_WINDOW}?page=${page}`)
    );
  }

  /**
   * Keyword IDs for one title (cached 24 hours). Movies return `keywords`; TV returns `results`.
   */
  static async getCachedKeywordIds(mediaType, mediaId) {
    try {
      const data = await MoviesController.getCached(
        `keywords-${mediaType}-${mediaId}`,
        KEYWORD_CACHE_MS,
        () => MoviesController.makeAPICall(`/${mediaType}/${mediaId}/keywords`)
      );
      return (data.keywords ?? data.results ?? []).map(keyword => keyword.id);
    } catch (error) {
      console.error(`Could not load keywords for ${mediaType} ${mediaId}:`, error.message);
      return [];
    }
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
   * Hydrate the frozen episodes for a season, most popular show first.
   */
  static async hydrateEpisodes(season) {
    const entries = await SeasonalController.loadFrozenEpisodes(season);
    return SeasonalController.buildEpisodeCards(entries);
  }

  /**
   * Fetch one TMDB season (cached 7 days). Returns null on failure so one season can't break the rail.
   */
  static async fetchTmdbSeason(showId, seasonNumber) {
    try {
      return await MoviesController.getCached(
        `tmdb-tv-season-${showId}-${seasonNumber}`,
        SEASON_EPISODES_CACHE_MS,
        () => MoviesController.makeAPICall(`/tv/${showId}/season/${seasonNumber}`)
      );
    } catch (error) {
      console.error(`Could not load TMDB season ${showId} S${seasonNumber}:`, error.message);
      return null;
    }
  }

  /**
   * Build landscape cards for frozen entries, most popular show first. Each TMDB season and show is fetched once (cached 7 days).
   */
  static async buildEpisodeCards(entries) {
    const seasonsByKey = new Map();
    const showsById = new Map();
    const cards = [];
    for (const entry of entries) {
      const seasonKey = `${entry.showId}-${entry.seasonNumber}`;
      if (!seasonsByKey.has(seasonKey)) {
        seasonsByKey.set(seasonKey, await SeasonalController.fetchTmdbSeason(entry.showId, entry.seasonNumber));
      }
      if (!showsById.has(entry.showId)) {
        showsById.set(entry.showId, await SeasonalController.fetchShow(entry.showId));
      }
      const card = SeasonalController.toEpisodeCard(entry, seasonsByKey.get(seasonKey), showsById.get(entry.showId));
      if (card) {
        cards.push(card);
      }
    }
    return cards.sort((a, b) => b.showPopularity - a.showPopularity);
  }

  /**
   * Build one card from a frozen entry, its TMDB season, and its TMDB show. Returns null when the episode is not on TMDB.
   * A missing still returns stillPath: null; the frontend substitutes its placeholder image.
   */
  static toEpisodeCard(entry, season, show) {
    const tmdbEpisode = season?.episodes?.find((episode) => episode.episode_number === entry.episodeNumber);
    if (!tmdbEpisode) {
      console.error(`Frozen episode not found on TMDB: ${entry.showId} S${entry.seasonNumber}E${entry.episodeNumber}`);
      return null;
    }
    return {
      showId: entry.showId,
      showName: show?.name ?? entry.showName ?? null,
      showPopularity: show?.popularity ?? 0,
      seasonNumber: entry.seasonNumber,
      episodeNumber: entry.episodeNumber,
      episodeTitle: tmdbEpisode.name,
      airDate: tmdbEpisode.air_date ?? null,
      rating: tmdbEpisode.vote_average ?? null,
      stillPath: tmdbEpisode.still_path ?? null,
    };
  }

  /**
   * Fetch a show's TMDB details (name, popularity), cached 7 days. Returns null on failure.
   */
  static async fetchShow(showId) {
    try {
      return await MoviesController.getCached(
        `tmdb-tv-${showId}`,
        SEASON_EPISODES_CACHE_MS,
        () => MoviesController.makeAPICall(`/tv/${showId}`)
      );
    } catch (error) {
      console.error(`Could not load TMDB show ${showId}:`, error.message);
      return null;
    }
  }

  /**
   * Frozen episode entries for one season. The file is read once per process.
   */
  static async loadFrozenEpisodes(season) {
    if (!cachedFrozenEpisodes) {
      cachedFrozenEpisodes = await SeasonalController.readFrozenFile();
    }
    return cachedFrozenEpisodes[season]?.episodes ?? [];
  }

  static async readFrozenFile() {
    try {
      return JSON.parse(await readFile(FROZEN_EPISODES_PATH, 'utf8'));
    } catch (error) {
      console.error('Failed to read seasonal.episodes.json:', error.message);
      return {};
    }
  }
}