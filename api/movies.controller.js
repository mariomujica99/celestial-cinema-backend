import dotenv from 'dotenv'
dotenv.config()

const API_KEY = process.env['TMDB_API_KEY'];
const BASE_URL = 'https://api.themoviedb.org/3';

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
}