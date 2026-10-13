/**
 * Seasonal rail definitions, filters, and metadata.
 * Each season defines rails with genre/keyword filters, allowed media types, and streaming base filter.
 * Keyword IDs are populated by scripts/resolveKeywords.js (run locally).
 * TV genres differ from movie genres; confirm against TMDB genre lists when adding new seasons.
 */

// Movie genres: Action, Adventure, Animation, Comedy, Crime, Documentary, Drama, Family, Fantasy, History, Horror, Mystery, Romance, Sci-Fi, Thriller, War
// TV genres: Action & Adventure, Animation, Comedy, Crime, Documentary, Drama, Family, Kids, Mystery, Reality, Sci-Fi & Fantasy, War & Politics

const HALLOWEEN = {
  key: 'halloween',
  window: { startMonth: 10, startDay: 1, endMonth: 11, endDay: 1 },
  hasEpisodeRails: true,
  title: 'Halloween',
  palette: 'halloween', // refs seasonal-themes.css
  
  keywordGroups: {
    HALLOWEEN: ['halloween'],
    HORROR_TV: ['horror', 'slasher', 'monster', 'vampire', 'werewolf', 'zombie', 'serial killer'],
    HAUNT: ['ghost', 'haunted house', 'haunting', 'poltergeist'],
    PSYCH: ['psychological thriller', 'psychopath', 'paranoia', 'mind games'],
    PARANORMAL: ['paranormal investigation', 'ghost hunter', 'exorcism', 'demon'],
    SUPERNATURAL: ['supernatural', 'witch', 'curse', 'occult'],
    HORROR_SUPERNATURAL: ['ghost', 'haunted house', 'haunting', 'poltergeist', 'paranormal investigation', 'ghost hunter', 'exorcism', 'demon'],    
    SCIFI_SCARE: ['alien', 'creature', 'mutation', 'infection'],
    HORROR_SCIFI: ['horror', 'slasher', 'vampire', 'werewolf', 'zombie', 'serial killer'],
    HORROR_EXCLUDE: ['horror', 'gore'],
  },

  // Resolved by resolveKeywords.js script; maps group name to array of TMDB keyword IDs
  resolvedKeywords: {
    "halloween": {
      "HALLOWEEN": [
        3335
      ],
      "HORROR_TV": [
        342626,
        12339,
        1299,
        3133,
        12564,
        12377,
        10714
      ],
      "HAUNT": [
        162846,
        3358,
        10224,
        3350
      ],
      "PSYCH": [
        12565,
        6259,
        2340,
        226106
      ],
      "PARANORMAL": [
        15043,
        159939,
        2626,
        15001
      ],
      "SUPERNATURAL": [
        6152,
        616,
        10541,
        156174
      ],
      "HORROR_SUPERNATURAL": [
        162846, 
        3358, 
        10224, 
        3350, 
        15043, 
        159939, 
        2626, 
        15001
      ],      
      "SCIFI_SCARE": [
        9951,
        13031,
        2766,
        4884
      ],
      "HORROR_SCIFI": [
        342626, 
        12339, 
        3133, 
        12564, 
        12377, 
        10714
      ],
      "HORROR_EXCLUDE": [
        342626,
        10292
      ]
    }
  },

  // Movie genre IDs (from TMDB)
  movieGenres: {
    Action: 28,
    Adventure: 12,
    Animation: 16,
    Comedy: 35,
    Crime: 80,
    Documentary: 99,
    Drama: 18,
    Family: 10751,
    Fantasy: 14,
    History: 36,
    Horror: 27,
    Mystery: 9648,
    Romance: 10749,
    Sci_Fi: 878,
    Thriller: 53,
    War: 10752,
  },

  // TV genre IDs (from TMDB)
  tvGenres: {
    Action_Adventure: 10759,
    Animation: 16,
    Comedy: 35,
    Crime: 80,
    Documentary: 99,
    Drama: 18,
    Family: 10751,
    Kids: 10762,
    Mystery: 9648,
    Reality: 10764,
    Sci_Fi_Fantasy: 10765,
    War_Politics: 10768,
  },

  streamingBase: {
    movies: { genres: ['Horror'] },
    tv: { keywords: ['HORROR_TV', 'HALLOWEEN'] }, // keyword group names (will be expanded to IDs at runtime)
  },

  rails: [
    {
      key: 'action-horror',
      title: 'Action Horror',
      types: ['movie', 'tv'],
      allowToggle: true,
      movieFilter: {
        genres: ['Horror', 'Action'],
        genreOp: 'AND',
      },
      tvFilter: {
        keywords: ['HORROR_TV'],
        genres: ['Action_Adventure'],
        genreOp: 'AND',
      },
    },
    {
      key: 'humorous-horror',
      title: 'Humorous Horror',
      types: ['movie', 'tv'],
      allowToggle: true,
      movieFilter: {
        genres: ['Horror', 'Comedy'],
        genreOp: 'AND',
      },
      tvFilter: {
        keywords: ['HORROR_TV'],
        genres: ['Comedy'],
        genreOp: 'AND',
        note: 'horror comedy',
      },
    },
    {
      key: 'halloween-episodes',
      title: 'Spooky Episodes',
      types: ['tv'],
      allowToggle: false,
      isEpisodeRail: true,
      episodeKind: 'live',
    },
    {
      key: 'animation-halloween-episodes',
      title: 'Animation Spooks',
      types: ['tv'],
      allowToggle: false,
      isEpisodeRail: true,
      episodeKind: 'animation',
    },
    {
      key: 'new-this-year',
      title: 'New This Year',
      types: ['movie', 'tv'],
      allowToggle: true,
      isNewThisYear: true,
    },
    {
      key: 'psychological-horror-thrillers',
      title: 'Psychological',
      types: ['movie', 'tv'],
      allowToggle: true,
      movieFilter: {
        genres: ['Horror', 'Thriller'],
        genreOp: 'OR',
        keywords: ['PSYCH'],
      },
      tvFilter: {
        keywords: ['PSYCH'],
        genres: ['Mystery', 'Drama'],
        genreOp: 'OR',
      },
    },
    {
      key: 'hauntings-paranormal',
      title: 'Paranormal',
      types: ['movie', 'tv'],
      allowToggle: true,
      movieFilter: {
        keywords: ['HAUNT', 'PARANORMAL'],
        keywordOp: 'OR',
      },
      tvFilter: {
        keywords: ['HAUNT', 'PARANORMAL'],
        keywordOp: 'OR',
      },
    },
    {
      key: 'family-horror',
      title: 'Family Horror',
      types: ['movie', 'tv'],
      allowToggle: true,
      movieFilter: {
        genres: ['Family', 'Animation'],
        genreOp: 'OR',
        keywords: ['HALLOWEEN'],
        certificationCountry: 'US',
        certificationMaxRating: 'PG',
      },
      tvFilter: {
        genres: ['Kids', 'Family'],
        genreOp: 'OR',
        keywords: ['HALLOWEEN'],
        keywordExclusions: ['HORROR_EXCLUDE'], // TV-specific: exclude horror/gore keywords
      },
    },
    {
      key: 'supernatural',
      title: 'Supernatural',
      types: ['movie', 'tv'],
      allowToggle: true,
      movieFilter: {
        keywords: ['SUPERNATURAL', 'HORROR_SUPERNATURAL'],
        keywordOp: 'AND',
        genres: ['Fantasy', 'Horror'],
        genreOp: 'OR',
      },
      tvFilter: {
        keywords: ['SUPERNATURAL'],
        genres: ['Sci_Fi_Fantasy'],
      },
    },
    {
      key: 'reality-frights',
      title: 'Reality Frights',
      types: ['tv'],
      allowToggle: false,
      tvFilter: {
        genres: ['Reality'],
        keywords: ['PARANORMAL'],
      },
    },
    {
      key: 'scifi-scares',
      title: 'Sci-Fi Scares',
      types: ['movie', 'tv'],
      allowToggle: true,
      movieFilter: {
        genres: ['Horror', 'Sci_Fi'],
        genreOp: 'AND',
      },
      tvFilter: {
        keywords: ['SCIFI_SCARE'],
        genres: ['Sci_Fi_Fantasy'],
      },
    },
  ],
};

export default {
  halloween: HALLOWEEN,
};