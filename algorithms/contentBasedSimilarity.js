const WEIGHTS = {
  genre:      0.25,
  cast:       0.20,
  keyword:    0.40,
  popularity: 0.08,
  collection: 0.07
};

const KEYWORD_MOVIE_SLOTS = 10;
const KEYWORD_TV_SLOTS    = 12;
const GENRE_MOVIE_SLOTS   =  6;
const GENRE_TV_SLOTS      =  6;

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

/**
 *
 * @param {object}   sourceSignals
 * @param {object[]} candidates
 * @param {Set<string>} franchiseCandidateIds
 * @param {Function} enrichCandidate
 * @param {number}   finalCount
 * @returns {Promise<object[]>}
 */
export async function rankCandidates(
  sourceSignals,
  candidates,
  franchiseCandidateIds,
  enrichCandidate,
  finalCount = 10
) {
  const { genreIds, castIds, keywordIds, collectionId } = sourceSignals;

  const pass1 = candidates.map(c => ({
    ...c,
    _isFranchise: franchiseCandidateIds.has(`${c.mediaType}_${c.id}`),
    _pass1Score: scoreCandidate(
      genreIds,
      new Set(),
      new Set(),
      collectionId,
      {
        genreIds:     c.genreIds     || new Set(),
        collectionId: c.collectionId ?? null,
        popularity:   c.popularity   || 0,
        voteAverage:  c.voteAverage  || 0,
        voteCount:    c.voteCount    || 0
      }
    )
  }));

  pass1.sort((a, b) => b._pass1Score - a._pass1Score);

  const franchiseMovies = pass1.filter(c => c._isFranchise && c.mediaType === 'movie');
  const franchiseTv     = pass1.filter(c => c._isFranchise && c.mediaType === 'tv');
  const genreMovies     = pass1.filter(c => !c._isFranchise && c.mediaType === 'movie');
  const genreTv         = pass1.filter(c => !c._isFranchise && c.mediaType === 'tv');

  const franchiseMovieSurvivors = franchiseMovies.slice(0, KEYWORD_MOVIE_SLOTS);
  const franchiseTvSurvivors    = franchiseTv.slice(0, KEYWORD_TV_SLOTS);

  const usedIds = new Set([
    ...franchiseMovieSurvivors.map(c => `${c.mediaType}_${c.id}`),
    ...franchiseTvSurvivors.map(c => `${c.mediaType}_${c.id}`)
  ]);

  const genreMovieSurvivors = genreMovies
    .filter(c => !usedIds.has(`${c.mediaType}_${c.id}`))
    .slice(0, GENRE_MOVIE_SLOTS);
  const genreTvSurvivors = genreTv
    .filter(c => !usedIds.has(`${c.mediaType}_${c.id}`))
    .slice(0, GENRE_TV_SLOTS);

  const survivors = [
    ...franchiseMovieSurvivors,
    ...franchiseTvSurvivors,
    ...genreMovieSurvivors,
    ...genreTvSurvivors
  ];

  const enriched = await Promise.all(survivors.map(c => enrichCandidate(c)));

  const pass2 = enriched.map(c => ({
    ...c,
    _score: scoreCandidate(
      genreIds,
      castIds,
      keywordIds,
      collectionId,
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

  pass2.sort((a, b) => b._score - a._score);
  return pass2.slice(0, finalCount);
}