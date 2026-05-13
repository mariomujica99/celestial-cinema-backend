# Celestial Cinema Backend

This is a Node.js/Express RESTful API server that powers the Celestial Cinema web application. This backend serves as a proxy to The Movie Database (TMDB) API and manages a custom review and watchlist system with MongoDB.

[![Website](https://img.shields.io/badge/Website-6A5ACD)](https://mariomujica99.github.io/celestial-cinema/index.html)
[![Frontend](https://img.shields.io/badge/Frontend-lightslategray)](https://github.com/mariomujica99/celestial-cinema)

## Features

#### TMDB API Integration
- Movie Data: Trending (day/week), popular, now playing, and top-rated movies
- TV Show Data: Trending, popular, airing today, top-rated, seasons, and episodes
- Search: Separate categorized search across movies, TV shows, and people with total counts per category, plus standard multi-search
- Detailed Information: Cast, crew, aggregate credits, release dates, content ratings, ratings, and metadata
- Person Profiles: Actor/crew biographies and combined filmographies
- Genre Discovery: Discover movies and TV shows by genre ID
- Watch Providers: US streaming, rental, and purchase options for movies and TV shows
- Videos: YouTube trailer lists for movies and TV shows
- Similar Media: Related movies and TV shows per title
- Popular People: Trending person discovery

#### Review System
- CRUD Operations: Full create, read, update, and delete
- Dual Media Support: Movies and TV shows handled with a shared `mediaId` field
- Granular TV Reviews: Review an entire series, a specific season, or a specific episode
- Filtering and Sorting: Query by user (regex), sort by date or rating
- Pagination: Configurable page size with `hasMore` flag for load-more UX
- Timestamp Tracking: `createdAt` and `updatedAt` fields set automatically

#### Watchlist System
- Toggle Endpoint: Single endpoint adds or removes an item based on existing state
- Check Endpoint: Returns whether a specific user/media combination is saved
- Remove by ID: Direct deletion by MongoDB ObjectId
- Global List: Shared watchlist sorted by most recently added

#### Security and Performance
- CORS: Open for frontend use
- Rate Limiting: 300 requests per 15 minutes globally; 20 write requests per 15 minutes on review mutations
- Environment Variables: TMDB API key and MongoDB credentials stored in `.env`
- Error Handling: Consistent error responses without exposing stack traces
- Input Validation: ID format checks and required parameter guards on all endpoints

## Technology Stack

#### Core Technologies
- Runtime: Node.js 16+
- Framework: Express.js 4.21.2
- Database: MongoDB (MongoDB Atlas)
- API Client: Node-fetch 3.3.2

#### Dependencies
- cors: ^2.8.5 - Cross-origin resource sharing
- dotenv: ^16.5.0 - Environment variable management
- express-rate-limit: ^7.5.1 - API rate limiting
- mongodb: ^6.17.0 - MongoDB native driver

#### Development Tools
- Postman: API development and testing environment

#### External Services
- TMDB API: Movie and TV show data
- MongoDB Atlas: Cloud-hosted database
- Render: Backend hosting platform

## API Endpoints

### Reviews API (`/api/v1/reviews`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | All reviews with optional `page`, `limit`, `sort`, `user` query params |
| GET | `/media/:id` | Reviews for a media ID, with optional `season` and `episode` filters |
| GET | `/:id` | Single review by MongoDB ObjectId |
| POST | `/new` | Create a review |
| PUT | `/:id` | Update a review |
| DELETE | `/:id` | Delete a review |
 
**Sort options:** `date-newest`, `date-oldest`, `rating-highest`, `rating-lowest`
 
**Movie Review Body**
```json
{
  "movieId": 550,
  "user": "John",
  "review": "Great film.",
  "rating": 9,
  "mediaType": "movie"
}
```
 
**Show Review Body**
```json
{
  "movieId": 1399,
  "user": "Jane",
  "review": "Best episode yet.",
  "rating": 10,
  "mediaType": "tv",
  "season": 1,
  "episode": 9
}
```

---

### Watchlist (`/api/v1/watchlist`)
 
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | All watchlist items sorted by `addedAt` descending |
| POST | `/toggle` | Add or remove an item based on username and mediaId |
| GET | `/check` | Check if a username/mediaId combination is saved |
| DELETE | `/:id` | Remove an item by MongoDB ObjectId |
 
**Body**
```json
{
  "username": "mario",
  "mediaId": "550",
  "title": "Fight Club",
  "year": 1999,
  "mediaType": "movie",
  "posterPath": "/path.jpg"
}
```

---

### Media API (`/api/v1/movies`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/trending/week` | Trending movies this week |
| GET | `/trending/day` | Trending movies today |
| GET | `/trending/tv/week` | Trending TV shows this week |
| GET | `/popular` | Popular movies |
| GET | `/now-playing` | Now playing movies |
| GET | `/upcoming` | Upcoming movies |
| GET | `/top-rated` | Top rated movies |
| GET | `/tv/popular` | Popular TV shows |
| GET | `/tv/airing-today` | TV shows airing today |
| GET | `/tv/on-the-air` | TV shows currently on the air |
| GET | `/tv/top-rated` | Top rated TV shows |
| GET | `/search` | Multi-search (movies, TV, people) |
| GET | `/search/categorized` | Categorized search with counts per type |
| GET | `/details/:id` | Movie details with release dates appended |
| GET | `/credits/:id` | Movie cast and crew |
| GET | `/watch-providers/:id` | US streaming/rental/purchase options for a movie |
| GET | `/videos/:id` | YouTube trailers for a movie |
| GET | `/similar/:id` | Similar movies |
| GET | `/genre/:genreId` | Discover movies by genre |
| GET | `/tv/details/:id` | TV show details with content ratings and external IDs appended |
| GET | `/tv/credits/:id` | TV episode-level cast and crew |
| GET | `/tv/aggregate_credits/:id` | Series-wide cast and crew with episode counts |
| GET | `/tv/seasons/:id` | Season list for a TV show |
| GET | `/tv/season/:id/:season` | Episodes for a specific season |
| GET | `/tv/watch-providers/:id` | US streaming/rental/purchase options for a TV show |
| GET | `/tv/videos/:id` | YouTube trailers for a TV show |
| GET | `/tv/similar/:id` | Similar TV shows |
| GET | `/tv/genre/:genreId` | Discover TV shows by genre |
| GET | `/person/:id` | Person biography and details |
| GET | `/person/:id/credits` | Combined movie and TV filmography |
| GET | `/people/popular` | Popular people |

## Database Schema

**Reviews Collection**

```javascript
{
  _id: ObjectId("..."),
  mediaId: 550,                    // TMDB media ID
  user: "John Doe",                // Username
  review: "Great movie!",          // Review text
  rating: 9,                       // 0-10 rating
  mediaType: "movie",              // "movie" or "tv"
  season: 1,                       // TV only (null for movies)
  episode: 5,                      // TV only (null for season reviews)
  createdAt: ISODate("..."),       // Auto-generated
  updatedAt: ISODate("...")        // On update
}
```

**Watchlist Collection**
```javascript
{
  _id: ObjectId,
  username: String,       // stored lowercase
  mediaId: String,
  title: String,
  year: Number,
  mediaType: String,      // "movie" | "tv"
  posterPath: String,
  addedAt: Date
}
```

## Architecture

#### Request Flow
```
Client Request
    ↓
Express Router
    ↓
Controller (Validation)
    ↓
┌─────────────────┬─────────────────┐
│   TMDB API      │   MongoDB       │
│   (External)    │   (Reviews)     │
└─────────────────┴─────────────────┘
    ↓
Response Formatting
    ↓
Client Response
```

## Security

- API key stored in environment variable, never exposed to the client
- CORS open for frontend GitHub Pages origin
- Rate limiting on all routes; stricter limits on write operations
- Input validation on all endpoints (ID format checks, required field guards)
- MongoDB native driver used directly; no raw string interpolation into queries
- Error responses omit stack traces in production

## Performance Optimizations

- Pagination on all list endpoints to limit response size
- MongoDB indexes on `mediaId` and `createdAt` for fast review queries
- Connection pooling (max 50 connections)
- Categorized search uses `Promise.all` to run three TMDB queries in parallel

## Author

**Mario Mujica**  
*Neurodiagnostic Technologist*  
*Full-Stack Software Developer*  
*B.S. in Neuroscience*

- GitHub: [@mariomujica99](https://github.com/mariomujica99)
- Backend Repository: [celestial-cinema-backend](https://github.com/mariomujica99/celestial-cinema-backend)
- LinkedIn: [www.linkedin.com/in/mario-mujica-903b19172]
- Handshake: [unomaha.joinhandshake.com/profiles/nbw72u](https://unomaha.joinhandshake.com/profiles/nbw72u)
- Email: mariomujica99@gmail.com

## Resources

- [The Movie Database (TMDB)](https://www.themoviedb.org/) for the comprehensive media API
- [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) for cloud database hosting
- [Render](https://render.com/) for reliable backend hosting
- [Express.js](https://expressjs.com/) community for excellent documentation

## Academic Integrity Notice

This personal project was built as a portfolio demonstration of full-stack development skills, including frontend design, backend API development, database management, and third-party API integration.
