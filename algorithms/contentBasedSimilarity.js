const WEIGHTS = {
  genre:      0.25,
  cast:       0.20,
  keyword:    0.40,
  popularity: 0.08,
  collection: 0.07
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

  const genreIntersect = [...sourceGenreIds].filter(id => genreIds.has(id)).length;
  const genreUnion     = new Set([...sourceGenreIds, ...genreIds]).size;
  const genreScore     = genreUnion > 0 ? genreIntersect / genreUnion : 0;

  const castIntersect = [...sourceCastIds].filter(id => castIds.has(id)).length;
  const castScore     = sourceCastIds.size > 0 ? castIntersect / sourceCastIds.size : 0;

  const kwIntersect = [...sourceKeywordIds].filter(id => keywordIds.has(id)).length;
  const kwUnion     = new Set([...sourceKeywordIds, ...keywordIds]).size;
  const kwScore     = kwUnion > 0 ? kwIntersect / kwUnion : 0;

  const popScore = Math.min(Math.log10(popularity + 1) / 3, 1);

  const qualityBoost        = voteCount > 100 ? Math.min(voteAverage / 10, 1) * 0.4 : 0;
  const popularityComponent = popScore * 0.6 + qualityBoost;

  const collectionScore =
    sourceCollectionId !== null &&
    collectionId       !== null &&
    sourceCollectionId === collectionId ? 1 : 0;

  const rawScore =
    WEIGHTS.genre      * genreScore          +
    WEIGHTS.cast       * castScore           +
    WEIGHTS.keyword    * kwScore             +
    WEIGHTS.popularity * popularityComponent +
    WEIGHTS.collection * collectionScore;

  return isFranchiseTv ? rawScore * 1.35 : rawScore;
}