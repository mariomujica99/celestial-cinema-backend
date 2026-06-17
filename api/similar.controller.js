import MoviesController from './movies.controller.js';
import { rankCandidates, scoreCandidate } from '../algorithms/contentBasedSimilarity.js';

const TOP_CAST_LIMIT = 15;

const KEYWORD_MOVIE_SLOTS = 15;
const KEYWORD_TV_SLOTS    = 20;
const GENRE_MOVIE_SLOTS   = 10;
const GENRE_TV_SLOTS      = 10;

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

async function enrichCandidate(candidate) {
  const [keywordIds, castIds] = await Promise.all([
    candidate.keywordIds instanceof Set
      ? Promise.resolve(candidate.keywordIds)
      : fetchKeywordIds(candidate.id, candidate.mediaType),
    fetchCastIds(candidate.id, candidate.mediaType)
  ]);
  return { ...candidate, keywordIds, castIds };
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

  const seen    = new Set();
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
 * @param {object[]}    recommendations
 * @param {number}      seedLimit
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
 * @param {number}   sourceIdInt - excluded from results
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

      for (const c of companyTvCandidates)       addCandidate(c, true);
      for (const c of kwMovieCandidates)         addCandidate(c, true);
      for (const c of kwTvCandidates)            addCandidate(c, true);
      for (const c of recommendationCandidates)  addCandidate(c, true);
      for (const c of movieDiscoverCandidates)   addCandidate(c, false);
      for (const c of tvDiscoverCandidates)      addCandidate(c, false);

      if (allCandidates.length === 0) return res.json({ results: [] });

      const sameTypeCount     = mediaType === 'movie' ? 6 : 4;
      const oppositeTypeCount = mediaType === 'movie' ? 4 : 6;
      const totalFinal        = sameTypeCount + oppositeTypeCount;

      const ranked = await rankCandidates(
        {
          genreIds:     sourceGenreIds,
          castIds:      sourceCastIds,
          keywordIds:   effectiveKeywordIds,
          collectionId: sourceCollectionId
        },
        allCandidates,
        franchiseCandidateIds,
        enrichCandidate,
        totalFinal
      );

      // Enforce type split: guarantee oppositeTypeCount cross-type results
      const oppositeType = mediaType === 'movie' ? 'tv' : 'movie';
      const CROSS_TYPE_FLOOR = oppositeTypeCount;

      const rankedOppositeCount = ranked.filter(c => c.mediaType === oppositeType).length;

      if (rankedOppositeCount < CROSS_TYPE_FLOOR) {
        const rankedIds       = new Set(ranked.map(c => `${c.mediaType}_${c.id}`));
        const missingOpposite = allCandidates
          .filter(c =>
            c.mediaType === oppositeType &&
            franchiseCandidateIds.has(`${oppositeType}_${c.id}`) &&
            !rankedIds.has(`${c.mediaType}_${c.id}`)
          )
          .slice(0, CROSS_TYPE_FLOOR - rankedOppositeCount);

        if (missingOpposite.length > 0) {
          const enrichedMissing = await Promise.all(missingOpposite.map(c => enrichCandidate(c)));

          const scoredMissing = enrichedMissing.map(c => ({
            ...c,
            _score: scoreCandidate(
              sourceGenreIds,
              sourceCastIds,
              effectiveKeywordIds,
              sourceCollectionId,
              {
                genreIds:     c.genreIds     || new Set(),
                castIds:      c.castIds      || new Set(),
                keywordIds:   c.keywordIds   || new Set(),
                collectionId: c.collectionId ?? null,
                popularity:   c.popularity   || 0,
                voteAverage:  c.voteAverage  || 0,
                voteCount:    c.voteCount    || 0
              },
              c._isFranchise === true && c.mediaType === 'tv'
            )
          }));

          const sameTypeInRanked = ranked
            .map((c, i) => ({ c, i }))
            .filter(({ c }) => c.mediaType !== oppositeType)
            .sort((a, b) => a.c._score - b.c._score);

          const slotsToFree    = Math.min(scoredMissing.length, sameTypeInRanked.length);
          const indicesToRemove = new Set(
            sameTypeInRanked.slice(0, slotsToFree).map(({ i }) => i)
          );

          const base = ranked.filter((_, i) => !indicesToRemove.has(i));
          ranked.length = 0;
          ranked.push(...base, ...scoredMissing);
        }
      }

      // Interleave: franchise items first (movies then TV alternating), genre items after
      const franchiseMovies = ranked
        .filter(c => franchiseCandidateIds.has(`${c.mediaType}_${c.id}`) && c.mediaType === 'movie')
        .sort((a, b) => (b._score ?? 0) - (a._score ?? 0));

      const franchiseTv = ranked
        .filter(c => franchiseCandidateIds.has(`${c.mediaType}_${c.id}`) && c.mediaType === 'tv')
        .sort((a, b) => (b._score ?? 0) - (a._score ?? 0));

      const otherRanked = ranked
        .filter(c => !franchiseCandidateIds.has(`${c.mediaType}_${c.id}`))
        .sort((a, b) => (b._score ?? 0) - (a._score ?? 0));

      const franchiseInterleaved = [];
      const maxFranchiseLen = Math.max(franchiseMovies.length, franchiseTv.length);
      for (let i = 0; i < maxFranchiseLen; i++) {
        if (franchiseMovies[i]) franchiseInterleaved.push(franchiseMovies[i]);
        if (franchiseTv[i])     franchiseInterleaved.push(franchiseTv[i]);
      }

      const results = [...franchiseInterleaved, ...otherRanked]
        .slice(0, totalFinal)
        .map(({ _score, _pass1Score, _isFranchise, genreIds, castIds, keywordIds, ...clean }) => ({
          ...clean,
          genre_ids:    [...(genreIds || [])],
          vote_average: clean.voteAverage,
          poster_path:  clean.posterPath,
          release_date: clean.releaseDate
        }));

      res.json({ results });
    } catch (error) {
      console.error('Similar media error:', error);
      res.status(500).json({ error: error.message });
    }
  }
}