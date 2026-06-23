import MoviesController from './movies.controller.js';
import { scoreCandidate, passesGenreFloor } from '../algorithms/contentBasedSimilarity.js';

const similarCache   = new Map();
const CACHE_TTL_MS   = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_SIZE = 300;

const TOP_CAST_LIMIT = 15;

// Sourcing tier multipliers — applied after base scoreCandidate.
// Order of priority: collection > company > keyword > recommendation > genre.
const TIER_MULTIPLIERS = {
  collection:     1.50,
  company:        1.40,
  keyword:        1.25,
  recommendation: 1.15,
  genre:          1.00
};

// Buckets exempt from the pass-1 genre-overlap floor — "same saga/universe"
// is a strong enough signal on its own even without genre overlap.
const GENRE_FLOOR_EXEMPT_BUCKETS = new Set(['collection', 'company', 'keyword', 'recommendation']);

// Convergence boost per additional bucket beyond the first.
// Capped at 3 extra buckets (+0.12 max) to stay within the 0-1 score scale.
const CONVERGENCE_BONUS_PER_BUCKET = 0.04;
const CONVERGENCE_MAX_EXTRA_BUCKETS = 3;

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
 * @param {string}      mediaType
 * @param {number}      sourceIdInt
 * @param {number}      pagesPerKeyword
 */
async function fetchDiscoverCandidatesByKeywords(keywordIds, mediaType, sourceIdInt, pagesPerKeyword = 1) {
  if (keywordIds.size === 0) return [];

  const TOP_KEYWORDS  = 5;
  const endpoint      = mediaType === 'tv' ? '/discover/tv' : '/discover/movie';
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

  const seeds  = recommendations.slice(0, seedLimit);
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

/**
 * Fetches the sibling movies of the source's TMDB collection.
 * Movie-only — TMDB has no equivalent "collection" concept for TV;
 * TV's franchise signal is covered by the existing company bucket.
 * Single conditional call: only fires when the source has a collection.
 *
 * @param {number} collectionId
 * @param {number} sourceIdInt - excluded from results
 * @returns {Promise<object[]>}
 */
async function fetchCollectionMembers(collectionId, sourceIdInt) {
  try {
    const data = await MoviesController.makeAPICall(`/collection/${collectionId}`);
    return (data.parts || [])
      .filter(item => item.id !== sourceIdInt)
      .map(item => normaliseItem(item, 'movie'));
  } catch {
    return [];
  }
}

/**
 * Resolves the highest-priority tier for a candidate given its sourcing buckets.
 * Priority: collection > company > keyword > recommendation > genre.
 *
 * @param {Set<string>} buckets
 * @returns {string}
 */
function resolveTier(buckets) {
  if (buckets.has('collection'))     return 'collection';
  if (buckets.has('company'))        return 'company';
  if (buckets.has('keyword'))        return 'keyword';
  if (buckets.has('recommendation')) return 'recommendation';
  return 'genre';
}

/**
 * Computes the convergence bonus for a candidate appearing in multiple buckets.
 * Each extra bucket beyond the first adds CONVERGENCE_BONUS_PER_BUCKET,
 * capped at CONVERGENCE_MAX_EXTRA_BUCKETS.
 *
 * @param {Set<string>} buckets
 * @returns {number}
 */
function convergenceBonus(buckets) {
  const extraBuckets = Math.min(buckets.size - 1, CONVERGENCE_MAX_EXTRA_BUCKETS);
  return extraBuckets * CONVERGENCE_BONUS_PER_BUCKET;
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

      // Collection fetch is conditional and movie-only — costs nothing
      // for TV sources or standalone movies with no collection.
      const [
        collectionCandidates,
        companyTvCandidates,
        movieDiscoverCandidates,
        tvDiscoverCandidates,
        kwMovieCandidates,
        kwTvCandidates
      ] = await Promise.all([
        mediaType === 'movie' && sourceCollectionId !== null
          ? fetchCollectionMembers(sourceCollectionId, sourceIdInt)
          : Promise.resolve([]),
        companyIds.length > 0
          ? fetchCompanyTvShows(companyIds, sourceIdInt)
          : Promise.resolve([]),
        fetchDiscoverCandidates(genreIdString, 'movie', sourceIdInt),
        fetchDiscoverCandidates(genreIdString, 'tv',    sourceIdInt),
        fetchDiscoverCandidatesByKeywords(effectiveKeywordIds, 'movie', sourceIdInt, 1),
        fetchDiscoverCandidatesByKeywords(effectiveKeywordIds, 'tv',    sourceIdInt, 2)
      ]);

      // Build a candidate map keyed by "mediaType_id".
      // Track ALL sourcing buckets per candidate rather than
      // first-seen only — this enables convergence scoring and
      // correct tier assignment without any additional API calls.
      const candidateMap = new Map();

      const registerCandidate = (c, bucket) => {
        const key = `${c.mediaType}_${c.id}`;
        if (candidateMap.has(key)) {
          candidateMap.get(key).buckets.add(bucket);
          // Collection data is authoritative — overwrite collectionId
          // if this candidate is now confirmed via the collection fetch.
          if (bucket === 'collection') {
            candidateMap.get(key).collectionId = c.collectionId ?? sourceCollectionId;
          }
        } else {
          const entry = { ...c, buckets: new Set([bucket]) };
          // Members returned by /collection/{id} are confirmed siblings —
          // stamp the source's own collectionId onto them directly since
          // belongs_to_collection on collection /parts items already
          // matches, but this guarantees the match even if TMDB data is
          // inconsistent on an individual part.
          if (bucket === 'collection') {
            entry.collectionId = sourceCollectionId;
          }
          candidateMap.set(key, entry);
        }
      };

      for (const c of collectionCandidates)     registerCandidate(c, 'collection');
      for (const c of companyTvCandidates)      registerCandidate(c, 'company');
      for (const c of kwMovieCandidates)        registerCandidate(c, 'keyword');
      for (const c of kwTvCandidates)           registerCandidate(c, 'keyword');
      for (const c of recommendationCandidates) registerCandidate(c, 'recommendation');
      for (const c of movieDiscoverCandidates)  registerCandidate(c, 'genre');
      for (const c of tvDiscoverCandidates)     registerCandidate(c, 'genre');

      // Pass-1 genre floor: drop candidates with zero genre overlap with
      // the source unless they're in an exempt (franchise-signal) bucket.
      // Stops genre-irrelevant noise (e.g. a sitcom surfacing for a
      // superhero movie via a loose recommendation/popularity signal)
      // from ever reaching scoring.
      const allCandidates = Array.from(candidateMap.values()).filter(c => {
        const isExempt = [...c.buckets].some(b => GENRE_FLOOR_EXEMPT_BUCKETS.has(b));
        return passesGenreFloor(sourceGenreIds, c.genreIds, isExempt);
      });

      if (allCandidates.length === 0) return res.json({ results: [] });

      const sameTypeCount     = mediaType === 'movie' ? 6 : 4;
      const oppositeTypeCount = mediaType === 'movie' ? 4 : 6;
      const totalFinal        = sameTypeCount + oppositeTypeCount;

      // Score every candidate using signals already present in
      // discover/recommendation/collection responses — no per-candidate
      // enrichment fetches needed. Precision comes from:
      //   1. Tier multiplier based on highest-priority sourcing bucket
      //      (collection > company > keyword > recommendation > genre)
      //   2. Convergence bonus for candidates appearing in multiple buckets
      //   3. isFranchiseTv boost retained for TV candidates in non-genre tiers
      //   4. Real collectionId data now flows into scoreCandidate's 2.5x
      //      in-score collection multiplier (previously always null)
      const scored = allCandidates.map(c => {
        const tier          = resolveTier(c.buckets);
        const isFranchiseTv = tier !== 'genre' && c.mediaType === 'tv';

        const base = scoreCandidate(
          sourceGenreIds,
          new Set(),            // cast: no per-candidate fetch, intentional
          effectiveKeywordIds,  // source keywords — non-zero overlap when candidate has keywordIds
          sourceCollectionId,
          {
            genreIds:     c.genreIds     || new Set(),
            castIds:      new Set(),
            keywordIds:   c.keywordIds   || new Set(),
            collectionId: c.collectionId ?? null,
            popularity:   c.popularity   || 0,
            voteAverage:  c.voteAverage  || 0,
            voteCount:    c.voteCount    || 0
          },
          isFranchiseTv
        );

        const finalScore =
          (base * TIER_MULTIPLIERS[tier]) + convergenceBonus(c.buckets);

        return { ...c, _score: finalScore, _tier: tier };
      });

      scored.sort((a, b) => b._score - a._score);

      // Shape output: collection siblings first (always on top, per product
      // decision), then franchise tiers (company/keyword/recommendation)
      // interleaved by media type, then genre-only items.
      const collectionTier = scored
        .filter(c => c._tier === 'collection')
        .sort((a, b) => b._score - a._score);

      const tieredMovies = scored
        .filter(c => c._tier !== 'genre' && c._tier !== 'collection' && c.mediaType === 'movie');

      const tieredTv = scored
        .filter(c => c._tier !== 'genre' && c._tier !== 'collection' && c.mediaType === 'tv');

      const genreOnly = scored
        .filter(c => c._tier === 'genre');

      const tieredInterleaved = [];
      const maxTieredLen = Math.max(tieredMovies.length, tieredTv.length);
      for (let i = 0; i < maxTieredLen; i++) {
        if (tieredMovies[i]) tieredInterleaved.push(tieredMovies[i]);
        if (tieredTv[i])     tieredInterleaved.push(tieredTv[i]);
      }

      const results = [...collectionTier, ...tieredInterleaved, ...genreOnly]
        .slice(0, totalFinal)
        .map(({ _score, _tier, buckets, genreIds, castIds, keywordIds, ...clean }) => ({
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