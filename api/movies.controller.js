import dotenv from 'dotenv'
dotenv.config()

const API_KEY = process.env['TMDB_API_KEY'];
const BASE_URL = 'https://api.themoviedb.org/3';

const HERO_CACHE_MS = 60 * 60 * 1000;
const BOX_OFFICE_CACHE_MS = 60 * 60 * 1000;
const GENRE_BACKDROPS_CACHE_MS = 24 * 60 * 60 * 1000;
const HERO_CANDIDATE_LIMIT = 16;
const HERO_SLIDE_LIMIT = 8;
const BOX_OFFICE_WINDOW_DAYS = 90;
const BOX_OFFICE_CANDIDATE_LIMIT = 12;
const BOX_OFFICE_RESULT_LIMIT = 10;
const MAX_GENRE_BACKDROP_IDS = 20;

export default class MoviesController {
  static async makeAPICall(endpoint) {
    try {
      const url = `${BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${API_KEY}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('API call failed:', error);
      throw new Error(`API call failed: ${error.message}`);
    }
  }

  static responseCache = new Map();

  static async getCached(cacheKey, ttlMs, loadData) {
    const cachedEntry = MoviesController.responseCache.get(cacheKey);
    if (cachedEntry && cachedEntry.expiresAt > Date.now()) return cachedEntry.data;

    const freshData = await loadData();
    const isEmpty = Array.isArray(freshData)
      ? freshData.length === 0
      : Object.keys(freshData).length === 0;

    if (!isEmpty) {
      MoviesController.responseCache.set(cacheKey, {
        data: freshData,
        expiresAt: Date.now() + ttlMs
      });
    }
    return freshData;
  }

  static collectFulfilledValues(settledResults) {
    return settledResults.reduce((values, result) => {
      if (result.status === 'rejected') {
        console.error('Parallel TMDB call failed:', result.reason);
      } else if (result.value) {
        values.push(result.value);
      }
      return values;
    }, []);
  }

  static parsePageParam(pageParam) {
    const page = parseInt(pageParam, 10);
    return page > 0 ? page : 1;
  }

  static filterYouTubeTrailers(videos) {
    return (videos || []).filter(video => video.type === 'Trailer' && video.site === 'YouTube');
  }

  static async apiGetTrendingWeek(req, res) {
    try {
      const page = req.query.page || 1;
      const data = await MoviesController.makeAPICall(`/trending/movie/week?page=${page}`);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiGetTrendingDay(req, res) {
    try {
      const page = req.query.page || 1;
      const data = await MoviesController.makeAPICall(`/trending/movie/day?page=${page}`);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiGetTrendingTVWeek(req, res) {
    try {
      const page = req.query.page || 1;
      const data = await MoviesController.makeAPICall(`/trending/tv/week?page=${page}`);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiGetTrendingAll(req, res) {
    try {
      const page = req.query.page || 1;
      const data = await MoviesController.makeAPICall(`/trending/all/day?page=${page}`);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static NOTABLE_POPULARITY_THRESHOLD = 5;

  static matchTier(item, query) {
    const text = (item.title || item.name || '').toLowerCase();
    const q = query.toLowerCase();
    let tier;
    if (text === q) tier = 0;
    else if (text.startsWith(q)) tier = 1;
    else if (text.includes(q)) tier = 2;
    else tier = 3;

    if (tier <= 1 && (item.popularity || 0) < MoviesController.NOTABLE_POPULARITY_THRESHOLD) {
      tier = 2;
    }
    return tier;
  }

  static recencyBoost(item) {
    const dateStr = item.release_date || item.first_air_date || '';
    if (!dateStr) return 0;
    const year = new Date(dateStr).getFullYear();
    const currentYear = new Date().getFullYear();
    return year >= currentYear - 1 ? 20 : 0;
  }

  static sortByRelevanceAndPopularity(results, query) {
    return [...(results || [])].sort((a, b) => {
      const tierDiff = MoviesController.matchTier(a, query) - MoviesController.matchTier(b, query);
      if (tierDiff !== 0) return tierDiff;
      const scoreA = (a.popularity || 0) + MoviesController.recencyBoost(a);
      const scoreB = (b.popularity || 0) + MoviesController.recencyBoost(b);
      return scoreB - scoreA;
    });
  }

  static async apiGetPopular(req, res) {
    try {
      const page = req.query.page || 1;
      const language = req.query.language || 'en-US';
      const region = req.query.region || '';
      
      let endpoint = `/movie/popular?page=${page}&language=${language}`;
      if (region) {
        endpoint += `&region=${region}`;
      }
      
      const data = await MoviesController.makeAPICall(endpoint);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiGetNowPlaying(req, res) {
    try {
      const page = req.query.page || 1;
      const language = req.query.language || 'en-US';
      const region = req.query.region || '';
      
      let endpoint = `/movie/now_playing?page=${page}&language=${language}`;
      if (region) {
        endpoint += `&region=${region}`;
      }
      
      const data = await MoviesController.makeAPICall(endpoint);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiGetUpcoming(req, res) {
    try {
      const page = req.query.page || 1;
      const language = req.query.language || 'en-US';
      const region = req.query.region || '';
      
      let endpoint = `/movie/upcoming?page=${page}&language=${language}`;
      if (region) {
        endpoint += `&region=${region}`;
      }
      
      const data = await MoviesController.makeAPICall(endpoint);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiGetTopRated(req, res) {
    try {
      const page = req.query.page || 1;
      const language = req.query.language || 'en-US';
      const region = req.query.region || '';
      
      let endpoint = `/movie/top_rated?page=${page}&language=${language}`;
      if (region) {
        endpoint += `&region=${region}`;
      }
      
      const data = await MoviesController.makeAPICall(endpoint);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiGetPopularTV(req, res) {
    try {
      const page = req.query.page || 1;
      const language = req.query.language || 'en-US';
      
      const data = await MoviesController.makeAPICall(`/tv/popular?page=${page}&language=${language}`);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiGetTVOnTheAir(req, res) {
    try {
      const page = req.query.page || 1;
      const language = req.query.language || 'en-US';
      const data = await MoviesController.makeAPICall(`/tv/on_the_air?page=${page}&language=${language}`);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiGetTVAiringToday(req, res) {
    try {
      const page = req.query.page || 1;
      const language = req.query.language || 'en-US';
      const data = await MoviesController.makeAPICall(`/tv/airing_today?page=${page}&language=${language}`);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiGetTVTopRated(req, res) {
    try {
      const page = req.query.page || 1;
      const language = req.query.language || 'en-US';
      const data = await MoviesController.makeAPICall(`/tv/top_rated?page=${page}&language=${language}`);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiSearchMulti(req, res) {
    try {
      const query = req.query.query;
      if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
      }
      
      const page = req.query.page || 1;
      const language = req.query.language || 'en-US';
      const includeAdult = req.query.include_adult || false;
      
      const endpoint = `/search/multi?query=${encodeURIComponent(query)}&page=${page}&language=${language}&include_adult=${includeAdult}`;
      const data = await MoviesController.makeAPICall(endpoint);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiSearchCategorized(req, res) {
    try {
      const query = req.query.query;
      if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
      }

      const page = req.query.page || 1;
      const language = req.query.language || 'en-US';
      const encodedQuery = encodeURIComponent(query);

      const [movieData, tvData, personData] = await Promise.all([
        MoviesController.makeAPICall(`/search/movie?query=${encodedQuery}&page=${page}&language=${language}&include_adult=false`),
        MoviesController.makeAPICall(`/search/tv?query=${encodedQuery}&page=${page}&language=${language}&include_adult=false`),
        MoviesController.makeAPICall(`/search/person?query=${encodedQuery}&page=${page}&language=${language}&include_adult=false`)
      ]);

      res.json({
        movies:      MoviesController.sortByRelevanceAndPopularity(movieData.results, query),
        tvShows:     MoviesController.sortByRelevanceAndPopularity(tvData.results, query),
        people:      MoviesController.sortByRelevanceAndPopularity(personData.results, query),
        movieCount:  movieData.total_results  || 0,
        tvCount:     tvData.total_results     || 0,
        peopleCount: personData.total_results || 0
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiGetMovieDetails(req, res) {
    try {
      const movieId = req.params.id;
      const language = req.query.language || 'en-US';
      
      if (!movieId || isNaN(movieId)) {
        return res.status(400).json({ error: 'Valid movie ID is required' });
      }
      
      const data = await MoviesController.makeAPICall(`/movie/${movieId}?language=${language}&append_to_response=release_dates`);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiGetMovieWatchProviders(req, res) {
    try {
      const movieId = req.params.id;
      if (!movieId || isNaN(movieId)) {
        return res.status(400).json({ error: 'Valid movie ID is required' });
      }
      const data = await MoviesController.makeAPICall(`/movie/${movieId}/watch/providers`);
      const usProviders = data.results?.US || {};
      res.json({
        flatrate: usProviders.flatrate || [],
        rent:     usProviders.rent     || [],
        buy:      usProviders.buy      || [],
        free:     usProviders.free     || []
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiGetMovieCredits(req, res) {
    try {
      const movieId = req.params.id;
      const language = req.query.language || 'en-US';
      
      if (!movieId || isNaN(movieId)) {
        return res.status(400).json({ error: 'Valid movie ID is required' });
      }
      
      const data = await MoviesController.makeAPICall(`/movie/${movieId}/credits?language=${language}`);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiGetTVDetails(req, res) {
    try {
      const tvId = req.params.id;
      const language = req.query.language || 'en-US';
      
      if (!tvId || isNaN(tvId)) {
        return res.status(400).json({ error: 'Valid TV ID is required' });
      }
      
      const data = await MoviesController.makeAPICall(`/tv/${tvId}?language=${language}&append_to_response=content_ratings,external_ids`);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiGetTVWatchProviders(req, res) {
    try {
      const tvId = req.params.id;
      if (!tvId || isNaN(tvId)) {
        return res.status(400).json({ error: 'Valid TV ID is required' });
      }
      const data = await MoviesController.makeAPICall(`/tv/${tvId}/watch/providers`);
      const usProviders = data.results?.US || {};
      res.json({
        flatrate: usProviders.flatrate || [],
        rent:     usProviders.rent     || [],
        buy:      usProviders.buy      || [],
        free:     usProviders.free     || []
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiGetTVCredits(req, res) {
    try {
      const tvId = req.params.id;
      const language = req.query.language || 'en-US';
      
      if (!tvId || isNaN(tvId)) {
        return res.status(400).json({ error: 'Valid TV ID is required' });
      }
      
      const data = await MoviesController.makeAPICall(`/tv/${tvId}/credits?language=${language}`);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiGetTVSeasons(req, res) {
    try {
      const tvId = req.params.id;
      const language = req.query.language || 'en-US';
      
      if (!tvId || isNaN(tvId)) {
        return res.status(400).json({ error: 'Valid TV ID is required' });
      }
      
      const data = await MoviesController.makeAPICall(`/tv/${tvId}?language=${language}`);
      
      const seasons = data.seasons ? data.seasons.map(season => ({
        id: season.id,
        name: season.name,
        season_number: season.season_number,
        episode_count: season.episode_count,
        overview: season.overview,
        poster_path: season.poster_path,
        air_date: season.air_date
      })) : [];
      
      res.json({ seasons });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiGetTVSeasonEpisodes(req, res) {
    try {
      const tvId = req.params.id;
      const seasonNumber = req.params.season;
      const language = req.query.language || 'en-US';
      
      if (!tvId || isNaN(tvId)) {
        return res.status(400).json({ error: 'Valid TV ID is required' });
      }
      
      if (!seasonNumber || isNaN(seasonNumber)) {
        return res.status(400).json({ error: 'Valid season number is required' });
      }
      
      const data = await MoviesController.makeAPICall(`/tv/${tvId}/season/${seasonNumber}?language=${language}`);
      
      const episodes = data.episodes ? data.episodes.map(episode => ({
        id: episode.id,
        name: episode.name,
        episode_number: episode.episode_number,
        overview: episode.overview,
        air_date: episode.air_date,
        runtime: episode.runtime,
        still_path: episode.still_path,
        vote_average: episode.vote_average,
        vote_count: episode.vote_count
      })) : [];
      
      res.json({ episodes });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiGetPersonDetails(req, res) {
    try {
      const personId = req.params.id;
      const language = req.query.language || 'en-US';
      
      if (!personId || isNaN(personId)) {
        return res.status(400).json({ error: 'Valid person ID is required' });
      }
      
      const data = await MoviesController.makeAPICall(`/person/${personId}?language=${language}`);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiGetPersonCredits(req, res) {
    try {
      const personId = req.params.id;
      const language = req.query.language || 'en-US';
      
      if (!personId || isNaN(personId)) {
        return res.status(400).json({ error: 'Valid person ID is required' });
      }
      
      const data = await MoviesController.makeAPICall(`/person/${personId}/combined_credits?language=${language}`);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiGetTVAggregateCredits(req, res) {
    try {
      const tvId = req.params.id;
      const language = req.query.language || 'en-US';
      
      if (!tvId || isNaN(tvId)) {
        return res.status(400).json({ error: 'Valid TV ID is required' });
      }
      
      const data = await MoviesController.makeAPICall(`/tv/${tvId}/aggregate_credits?language=${language}`);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiGetMoviesByGenre(req, res) {
    try {
      const { genreId } = req.params;
      const page = req.query.page || 1;

      if (!genreId || isNaN(genreId)) {
        return res.status(400).json({ error: 'Valid genre ID is required' });
      }

      const data = await MoviesController.makeAPICall(
        `/discover/movie?with_genres=${genreId}&sort_by=popularity.desc&page=${page}`
      );
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiGetTVByGenre(req, res) {
    try {
      const { genreId } = req.params;
      const page = req.query.page || 1;

      if (!genreId || isNaN(genreId)) {
        return res.status(400).json({ error: 'Valid genre ID is required' });
      }

      const data = await MoviesController.makeAPICall(
        `/discover/tv?with_genres=${genreId}&sort_by=popularity.desc&page=${page}`
      );
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiGetPopularPeople(req, res) {
    try {
      const page = req.query.page || 1;
      const data = await MoviesController.makeAPICall(`/person/popular?page=${page}`);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiGetMovieVideos(req, res) {
    try {
      const movieId = req.params.id;
      if (!movieId || isNaN(movieId)) {
        return res.status(400).json({ error: 'Valid movie ID is required' });
      }
      const data = await MoviesController.makeAPICall(`/movie/${movieId}/videos`);
      res.json({ results: MoviesController.filterYouTubeTrailers(data.results) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiGetTVVideos(req, res) {
    try {
      const tvId = req.params.id;
      if (!tvId || isNaN(tvId)) {
        return res.status(400).json({ error: 'Valid TV ID is required' });
      }
      const data = await MoviesController.makeAPICall(`/tv/${tvId}/videos`);
      res.json({ results: MoviesController.filterYouTubeTrailers(data.results) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static formatBackdrops(backdrops) {
    return (backdrops || []).map(backdrop => ({
      file_path: backdrop.file_path,
      width: backdrop.width,
      height: backdrop.height
    }));
  }

  static async apiGetMovieImages(req, res) {
    try {
      const movieId = req.params.id;
      if (!movieId || isNaN(movieId)) {
        return res.status(400).json({ error: 'Valid movie ID is required' });
      }
      const data = await MoviesController.makeAPICall(`/movie/${movieId}/images`);
      res.json({ backdrops: MoviesController.formatBackdrops(data.backdrops) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiGetTVImages(req, res) {
    try {
      const tvId = req.params.id;
      if (!tvId || isNaN(tvId)) {
        return res.status(400).json({ error: 'Valid TV ID is required' });
      }
      const data = await MoviesController.makeAPICall(`/tv/${tvId}/images`);
      res.json({ backdrops: MoviesController.formatBackdrops(data.backdrops) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiGetSimilarMovies(req, res) {
    try {
      const movieId = req.params.id;
      if (!movieId || isNaN(movieId)) {
        return res.status(400).json({ error: 'Valid movie ID is required' });
      }
      const data = await MoviesController.makeAPICall(`/movie/${movieId}/similar`);
      res.json({ results: data.results || [] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiGetSimilarTV(req, res) {
    try {
      const tvId = req.params.id;
      if (!tvId || isNaN(tvId)) {
        return res.status(400).json({ error: 'Valid TV ID is required' });
      }
      const data = await MoviesController.makeAPICall(`/tv/${tvId}/similar`);
      res.json({ results: data.results || [] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static pickHeroBackdrop(details) {
    const textlessBackdrops = (details.images?.backdrops || [])
      .filter(backdrop => !backdrop.iso_639_1)
      .sort((a, b) => b.vote_average - a.vote_average);
    return textlessBackdrops[0]?.file_path || details.backdrop_path || null;
  }

  static async fetchHeroSlide(item) {
    const mediaType = item.media_type;
    const details = await MoviesController.makeAPICall(
      `/${mediaType}/${item.id}?language=en-US&append_to_response=videos,images` +
      `&include_image_language=en,null&include_video_language=en,null`
    );
    const trailers = MoviesController.filterYouTubeTrailers(details.videos?.results);
    const backdropPath = MoviesController.pickHeroBackdrop(details);
    if (trailers.length === 0 || !backdropPath) return null;

    return {
      id: details.id,
      mediaType,
      title: details.title || details.name || '',
      releaseDate: details.release_date || details.first_air_date || '',
      voteAverage: details.vote_average ?? null,
      posterPath: details.poster_path || null,
      backdropPath,
      trailers: trailers.map(({ key, name, type, published_at }) => ({ key, name, type, published_at }))
    };
  }

  static async loadHeroSlides() {
    const trending = await MoviesController.makeAPICall('/trending/all/week');
    const candidates = (trending.results || [])
      .filter(item => item.media_type === 'movie' || item.media_type === 'tv')
      .slice(0, HERO_CANDIDATE_LIMIT);

    const settledSlides = await Promise.allSettled(
      candidates.map(item => MoviesController.fetchHeroSlide(item))
    );
    return MoviesController.collectFulfilledValues(settledSlides).slice(0, HERO_SLIDE_LIMIT);
  }

  static async apiGetHomeHero(req, res) {
    try {
      const slides = await MoviesController.getCached(
        'home-hero',
        HERO_CACHE_MS,
        MoviesController.loadHeroSlides
      );
      res.json({ results: slides });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static formatDateParam(date) {
    return date.toISOString().slice(0, 10);
  }

  static buildBoxOfficeDiscoverEndpoint(page) {
    const today = new Date();
    const windowStart = new Date(today.getTime() - BOX_OFFICE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    return `/discover/movie?sort_by=revenue.desc&include_adult=false&language=en-US` +
      `&primary_release_date.gte=${MoviesController.formatDateParam(windowStart)}` +
      `&primary_release_date.lte=${MoviesController.formatDateParam(today)}&page=${page}`;
  }

  static async fetchBoxOfficeEntry(movie) {
    const details = await MoviesController.makeAPICall(`/movie/${movie.id}?language=en-US`);
    if (!details.revenue) return null;

    return {
      id: details.id,
      title: details.title || '',
      releaseDate: details.release_date || '',
      runtime: details.runtime ?? null,
      voteAverage: details.vote_average ?? null,
      posterPath: details.poster_path || null,
      overview: details.overview || '',
      budget: details.budget || 0,
      revenue: details.revenue
    };
  }

  static async loadBoxOfficeEntries() {
    const discoverData = await MoviesController.makeAPICall(
      MoviesController.buildBoxOfficeDiscoverEndpoint(1)
    );
    const candidates = (discoverData.results || []).slice(0, BOX_OFFICE_CANDIDATE_LIMIT);

    const settledEntries = await Promise.allSettled(
      candidates.map(movie => MoviesController.fetchBoxOfficeEntry(movie))
    );
    return MoviesController.collectFulfilledValues(settledEntries)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, BOX_OFFICE_RESULT_LIMIT);
  }

  static async apiGetHomeBoxOffice(req, res) {
    try {
      const entries = await MoviesController.getCached(
        'home-box-office',
        BOX_OFFICE_CACHE_MS,
        MoviesController.loadBoxOfficeEntries
      );
      res.json({ results: entries });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiGetBoxOffice(req, res) {
    try {
      const page = MoviesController.parsePageParam(req.query.page);
      const data = await MoviesController.makeAPICall(
        MoviesController.buildBoxOfficeDiscoverEndpoint(page)
      );
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static parseGenreIds(idsParam) {
    return String(idsParam || '')
      .split(',')
      .filter(genreId => /^\d+$/.test(genreId))
      .slice(0, MAX_GENRE_BACKDROP_IDS);
  }

  static async fetchGenreBackdropCandidates(genreId) {
    const data = await MoviesController.makeAPICall(
      `/discover/movie?with_genres=${genreId}&sort_by=popularity.desc` +
      `&vote_count.gte=200&include_adult=false&language=en-US`
    );
    return (data.results || [])
      .filter(movie => movie.backdrop_path)
      .map(movie => movie.backdrop_path);
  }

  static async loadGenreBackdrops(genreIds) {
    const settledCandidates = await Promise.allSettled(
      genreIds.map(genreId => MoviesController.fetchGenreBackdropCandidates(genreId))
    );

    const usedBackdrops = new Set();
    const backdrops = {};

    genreIds.forEach((genreId, index) => {
      const result = settledCandidates[index];
      if (result.status === 'rejected') {
        console.error('Genre backdrop failed:', result.reason);
        return;
      }
      const backdropPath = result.value.find(path => !usedBackdrops.has(path));
      if (!backdropPath) return;

      usedBackdrops.add(backdropPath);
      backdrops[genreId] = backdropPath;
    });
    return backdrops;
  }

  static async apiGetHomeGenreBackdrops(req, res) {
    try {
      const genreIds = MoviesController.parseGenreIds(req.query.ids);
      if (genreIds.length === 0) {
        return res.status(400).json({ error: 'At least one valid genre ID is required' });
      }

      const backdrops = await MoviesController.getCached(
        `genre-backdrops:${genreIds.join(',')}`,
        GENRE_BACKDROPS_CACHE_MS,
        () => MoviesController.loadGenreBackdrops(genreIds)
      );
      res.json({ backdrops });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async apiGetStreaming(req, res) {
    try {
      const { providerId } = req.params;
      const mediaType = req.query.type || 'movie';
      const page = MoviesController.parsePageParam(req.query.page);

      if (!/^\d+$/.test(providerId)) {
        return res.status(400).json({ error: 'Valid provider ID is required' });
      }
      if (mediaType !== 'movie' && mediaType !== 'tv') {
        return res.status(400).json({ error: "Type must be 'movie' or 'tv'" });
      }

      const data = await MoviesController.makeAPICall(
        `/discover/${mediaType}?with_watch_providers=${providerId}&watch_region=US` +
        `&with_watch_monetization_types=flatrate&sort_by=popularity.desc&page=${page}`
      );
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}