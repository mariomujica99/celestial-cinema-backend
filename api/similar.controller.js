import MoviesController from './movies.controller.js';
import { scoreCandidate } from '../algorithms/contentBasedSimilarity.js';

const similarCache   = new Map();
const CACHE_TTL_MS   = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_SIZE = 300;

const TOP_CAST_LIMIT = 15;

async function fetchKeywordIds(mediaId, mediaType) {
  try {
    const endpoint = mediaType === 'tv'
      ? `/tv/${mediaId}/keywords`
      : `/movie/${mediaId}/keywords`;
    const data = await MoviesController.makeAPICall(endpoint);
    const list = data.results || data.keywords || [];
    return new Set(list.map(k => k.id));
  } catch {
    return new Set();
  }
}

async function fetchCastIds(mediaId, mediaType) {
  try {
    const endpoint = mediaType === 'tv'
      ? `/tv/${mediaId}/aggregate_credits`
      : `/movie/${mediaId}/credits`;
    const data = await MoviesController.makeAPICall(endpoint);
    const cast = (data.cast || []).slice(0, TOP_CAST_LIMIT);
    return new Set(cast.map(c => c.id));
  } catch {
    return new Set();
  }
}

function normaliseItem(item, mediaType) {
  return {
    id:           item.id,
    mediaType,
    title:        item.title || item.name || '',
    posterPath:   item.poster_path   || null,
    backdropPath: item.backdrop_path || null,
    releaseDate:  item.release_date  || item.first_air_date || '',
    voteAverage:  item.vote_average  || 0,
    voteCount:    item.vote_count    || 0,
    popularity:   item.popularity    || 0,
    genreIds:     new Set(item.genre_ids || []),
    collectionId: item.belongs_to_collection?.id ?? null
  };
}

async function fetchDiscoverCandidates(genreIdString, mediaType, sourceIdInt) {
  const endpoint = mediaType === 'tv' ? '/discover/tv' : '/discover/movie';
  try {
    const data = await MoviesController.makeAPICall(
      `${endpoint}?with_genres=${genreIdString}&sort_by=popularity.desc&page=1&include_adult=false`
    );
    return (data.results || [])
      .filter(item => item.id !== sourceIdInt)
      .map(item => normaliseItem(item, mediaType));
  } catch {
    return [];
  }
}

async function fetchRecommendationCandidates(mediaId, mediaType, sourceIdInt) {
  const endpoint = mediaType === 'tv'
    ? `/tv/${mediaId}/recommendations`
    : `/movie/${mediaId}/recommendations`;
  try {
    const data = await MoviesController.makeAPICall(`${endpoint}?page=1`);
    return (data.results || [])
      .filter(item => item.id !== sourceIdInt)
      .map(item => {
        const inferredType = item.title ? 'movie' : 'tv';
        return normaliseItem(item, inferredType);
      });
  } catch {
    return [];
  }
}

/**
 * @param {Set<number>} keywordIds
 * @param {string}      mediaType   - 'movie' | 'tv'
 * @param {number}      sourceIdInt
 * @param {number}      pagesPerKeyword
 */
async function fetchDiscoverCandidatesByKeywords(keywordIds, mediaType, sourceIdInt, pagesPerKeyword = 1) {
  if (keywordIds.size === 0) return [];

  const TOP_KEYWORDS = 5;
  const endpoint = mediaType === 'tv' ? '/discover/tv' : '/discover/movie';
  const topKeywordIds = [...keywordIds].slice(0, TOP_KEYWORDS);

  const fetchPromises = [];
  for (const kwId of topKeywordIds) {
    for (let page = 1; page <= pagesPerKeyword; page++) {
      fetchPromises.push(
        MoviesController.makeAPICall(
          `${endpoint}?with_keywords=${kwId}&sort_by=popularity.desc&page=${page}&include_adult=false`
        ).catch(() => ({ results: [] }))
      );
    }
  }

  const pageResults = await Promise.all(fetchPromises);

  const seen       = new Set();
  const candidates = [];

  for (const { results = [] } of pageResults) {
    for (const item of results) {
      if (item.id === sourceIdInt) continue;
      const key = `${mediaType}_${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(normaliseItem(item, mediaType));
    }
  }

  return candidates;
}

/**
 * @param {object[]} recommendations
 * @param {number}   seedLimit
 * @returns {Promise<Set<number>>}
 */
async function seedKeywordsFromRecommendations(recommendations, seedLimit = 4) {
  if (recommendations.length === 0) return new Set();

  const seeds = recommendations.slice(0, seedLimit);
  const kwSets = await Promise.all(
    seeds.map(c => fetchKeywordIds(c.id, c.mediaType))
  );

  const merged = new Set();
  for (const kwSet of kwSets) {
    for (const id of kwSet) merged.add(id);
  }
  return merged;
}

/**
 * @param {number[]} companyIds
 * @param {number}   sourceIdInt
 * @returns {Promise<object[]>}
 */
async function fetchCompanyTvShows(companyIds, sourceIdInt) {
  const companyIdString = companyIds.join('|');
  try {
    const data = await MoviesController.makeAPICall(
      `/discover/tv?with_companies=${companyIdString}&sort_by=popularity.desc&page=1&include_adult=false`
    );
    return (data.results || [])
      .filter(item => item.id !== sourceIdInt)
      .map(item => normaliseItem(item, 'tv'));
  } catch {
    return [];
  }
}

export default class SimilarController {
  static async apiGetSimilar(req, res) {
    try {
      const { mediaType, id: mediaId } = req.params;

      if (!['movie', 'tv'].includes(mediaType)) {
        return res.status(400).json({ error: 'mediaType must be "movie" or "tv"' });
      }
      if (!mediaId || isNaN(mediaId)) {
        return res.status(400).json({ error: 'Valid media ID is required' });
      }

      const cacheKey = `${mediaType}_${mediaId}`;
      const cached   = similarCache.get(cacheKey);
      const nowMs    = Date.now();

      if (cached && nowMs - cached.timestamp < CACHE_TTL_MS) {
        return res.json({ results: cached.results });
      }

      const sourceIdInt = parseInt(mediaId);

      const detailsEndpoint = mediaType === 'tv'
        ? `/tv/${mediaId}?append_to_response=content_ratings,external_ids`
        : `/movie/${mediaId}?append_to_response=release_dates`;

      const [sourceDetails, sourceKeywordIds, sourceCastIds, recommendationCandidates] =
        await Promise.all([
          MoviesController.makeAPICall(detailsEndpoint),
          fetchKeywordIds(mediaId, mediaType),
          fetchCastIds(mediaId, mediaType),
          fetchRecommendationCandidates(mediaId, mediaType, sourceIdInt)
        ]);

      const sourceGenreIds     = new Set((sourceDetails.genres || []).map(g => g.id));
      const sourceCollectionId = sourceDetails.belongs_to_collection?.id ?? null;
      const genreIdString      = [...sourceGenreIds].join(',');

      if (!genreIdString) return res.json({ results: [] });

      const KEYWORD_THRESHOLD = 3;
      let effectiveKeywordIds = sourceKeywordIds;

      if (effectiveKeywordIds.size < KEYWORD_THRESHOLD) {
        effectiveKeywordIds = await seedKeywordsFromRecommendations(recommendationCandidates);
      }

      const companyIds = (sourceDetails.production_companies || [])
        .map(c => c.id)
        .slice(0, 3);

      const [
        companyTvCandidates,
        movieDiscoverCandidates,
        tvDiscoverCandidates,
        kwMovieCandidates,
        kwTvCandidates
      ] = await Promise.all([
        companyIds.length > 0
          ? fetchCompanyTvShows(companyIds, sourceIdInt)
          : Promise.resolve([]),
        fetchDiscoverCandidates(genreIdString, 'movie', sourceIdInt),
        fetchDiscoverCandidates(genreIdString, 'tv',    sourceIdInt),
        fetchDiscoverCandidatesByKeywords(effectiveKeywordIds, 'movie', sourceIdInt, 1),
        fetchDiscoverCandidatesByKeywords(effectiveKeywordIds, 'tv',    sourceIdInt, 2)
      ]);

      const franchiseCandidateIds = new Set();
      const seenGlobal            = new Set();
      const allCandidates         = [];

      const addCandidate = (c, isFranchise) => {
        const key = `${c.mediaType}_${c.id}`;
        if (seenGlobal.has(key)) return;
        seenGlobal.add(key);
        if (isFranchise) franchiseCandidateIds.add(key);
        allCandidates.push(c);
      };

      for (const c of companyTvCandidates)      addCandidate(c, true);
      for (const c of kwMovieCandidates)        addCandidate(c, true);
      for (const c of kwTvCandidates)           addCandidate(c, true);
      for (const c of recommendationCandidates) addCandidate(c, true);
      for (const c of movieDiscoverCandidates)  addCandidate(c, false);
      for (const c of tvDiscoverCandidates)     addCandidate(c, false);

      if (allCandidates.length === 0) return res.json({ results: [] });

      const sameTypeCount     = mediaType === 'movie' ? 6 : 4;
      const oppositeTypeCount = mediaType === 'movie' ? 4 : 6;
      const totalFinal        = sameTypeCount + oppositeTypeCount;

      // Score every candidate using only signals already present in
      // discover/recommendation responses. No per-candidate enrichment
      // fetches needed — cast and keyword scoring resolve to 0 via
      // empty Sets, but keyword sourcing above still drives candidate
      // pool thematic relevance.
      const scored = allCandidates.map(c => ({
        ...c,
        _score: scoreCandidate(
          sourceGenreIds,
          new Set(),
          new Set(),
          sourceCollectionId,
          {
            genreIds:     c.genreIds     || new Set(),
            castIds:      new Set(),
            keywordIds:   new Set(),
            collectionId: c.collectionId ?? null,
            popularity:   c.popularity   || 0,
            voteAverage:  c.voteAverage  || 0,
            voteCount:    c.voteCount    || 0
          },
          franchiseCandidateIds.has(`${c.mediaType}_${c.id}`) && c.mediaType === 'tv'
        )
      }));

      scored.sort((a, b) => b._score - a._score);

      // Interleave: franchise items first (movies then TV alternating),
      // genre/popularity items after.
      const franchiseMovies = scored
        .filter(c => franchiseCandidateIds.has(`${c.mediaType}_${c.id}`) && c.mediaType === 'movie');

      const franchiseTv = scored
        .filter(c => franchiseCandidateIds.has(`${c.mediaType}_${c.id}`) && c.mediaType === 'tv');

      const otherRanked = scored
        .filter(c => !franchiseCandidateIds.has(`${c.mediaType}_${c.id}`));

      const franchiseInterleaved = [];
      const maxFranchiseLen = Math.max(franchiseMovies.length, franchiseTv.length);
      for (let i = 0; i < maxFranchiseLen; i++) {
        if (franchiseMovies[i]) franchiseInterleaved.push(franchiseMovies[i]);
        if (franchiseTv[i])     franchiseInterleaved.push(franchiseTv[i]);
      }

      const results = [...franchiseInterleaved, ...otherRanked]
        .slice(0, totalFinal)
        .map(({ _score, _isFranchise, genreIds, castIds, keywordIds, ...clean }) => ({
          ...clean,
          genre_ids:    [...(genreIds || [])],
          vote_average: clean.voteAverage,
          poster_path:  clean.posterPath,
          release_date: clean.releaseDate
        }));

      if (similarCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = similarCache.keys().next().value;
        similarCache.delete(oldestKey);
      }
      similarCache.set(cacheKey, { results, timestamp: Date.now() });

      res.json({ results });
    } catch (error) {
      console.error('Similar media error:', error);
      res.status(500).json({ error: error.message });
    }
  }
}