const WEIGHTS = {
  genre:      0.34,
  cast:       0.20,
  keyword:    0.42,
  popularity: 0.04
};

/**
 * @param {Set<number>} sourceGenreIds
 * @param {Set<number>} sourceCastIds
 * @param {Set<number>} sourceKeywordIds
 * @param {number|null} sourceCollectionId
 * @param {object}      candidateSignals
 * @param {boolean}     [isFranchiseTv]
 * @returns {number}
 */
export function scoreCandidate(
  sourceGenreIds,
  sourceCastIds,
  sourceKeywordIds,
  sourceCollectionId,
  candidateSignals,
  isFranchiseTv = false
) {
  const {
    genreIds     = new Set(),
    castIds      = new Set(),
    keywordIds   = new Set(),
    collectionId = null,
    popularity   = 0,
    voteAverage  = 0,
    voteCount    = 0
  } = candidateSignals;

  // Genre overlap: Jaccard similarity
  const genreIntersect = [...sourceGenreIds].filter(id => genreIds.has(id)).length;
  const genreUnion     = new Set([...sourceGenreIds, ...genreIds]).size;
  const genreScore     = genreUnion > 0 ? genreIntersect / genreUnion : 0;

  // Cast overlap: intersection / source cast size
  const castIntersect = [...sourceCastIds].filter(id => castIds.has(id)).length;
  const castScore     = sourceCastIds.size > 0 ? castIntersect / sourceCastIds.size : 0;

  // Keyword overlap: Jaccard similarity
  const kwIntersect = [...sourceKeywordIds].filter(id => keywordIds.has(id)).length;
  const kwUnion     = new Set([...sourceKeywordIds, ...keywordIds]).size;
  const kwScore     = kwUnion > 0 ? kwIntersect / kwUnion : 0;

  // Popularity + quality tiebreaker
  const popScore            = Math.min(Math.log10(popularity + 1) / 3, 1);
  const qualityBoost        = voteCount > 100 ? Math.min(voteAverage / 10, 1) * 0.4 : 0;
  const popularityComponent = popScore * 0.6 + qualityBoost;

  const rawScore =
    WEIGHTS.genre      * genreScore          +
    WEIGHTS.cast       * castScore           +
    WEIGHTS.keyword    * kwScore             +
    WEIGHTS.popularity * popularityComponent;

  // Collection match: hard 2.5x multiplier on the full score.
  // This is the strongest signal — same franchise trumps everything.
  const inCollection =
    sourceCollectionId !== null &&
    collectionId       !== null &&
    sourceCollectionId === collectionId;

  const afterCollection = inCollection ? rawScore * 2.5 : rawScore;

  // TV franchise boost retained as before
  return isFranchiseTv ? afterCollection * 1.35 : afterCollection;
}

/**
 * Pass-1 relevance gate: does this candidate share at least one genre ID
 * with the source? Used to drop genre-irrelevant noise (e.g. a sitcom
 * surfacing for a superhero movie via a loose recommendation/popularity
 * signal) before it ever reaches scoring.
 *
 * Candidates sourced from the collection or franchise buckets (company /
 * keyword / recommendation) are exempt — "same saga/universe" can matter
 * even when TMDB's genre tags don't line up (e.g. animated spinoff vs
 * live-action source).
 *
 * @param {Set<number>} sourceGenreIds
 * @param {Set<number>} candidateGenreIds
 * @param {boolean}     isExempt - true for collection/company/keyword/recommendation buckets
 * @returns {boolean}
 */
export function passesGenreFloor(sourceGenreIds, candidateGenreIds, isExempt) {
  if (isExempt) return true;
  if (!candidateGenreIds || candidateGenreIds.size === 0) return false;
  for (const id of candidateGenreIds) {
    if (sourceGenreIds.has(id)) return true;
  }
  return false;
}