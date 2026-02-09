# Celestial Cinema Backend

This is a Node.js/Express RESTful API server that powers the Celestial Cinema web application. This backend serves as a proxy to The Movie Database (TMDB) API and manages a custom review system with MongoDB. Comprehensive movie and TV show data is provided along with user ratings and reviews.

[![Website](https://img.shields.io/badge/Website-6A5ACD)](https://mariomujica99.github.io/celestial-cinema/index.html)
[![Frontend](https://img.shields.io/badge/Frontend-lightslategray)](https://github.com/mariomujica99/celestial-cinema)

## Features

#### TMDB API Integration
- Movie Data: Trending, popular, now playing, upcoming, and top-rated movies
- TV Show Data: Popular series, seasons, episodes, and aggregate credits
- Search: Multi-search across movies, TV shows, and people
- Detailed Information: Cast, crew, release dates, ratings, and metadata
- Person Profiles: Actor/crew biographies and filmographies

#### Review System
- CRUD Operations: Full create, read, update, and delete functionality
- Dual Media Support: Separate handling for movies and TV shows
- Granular TV Reviews: Review specific episodes or entire seasons
- Filtering & Sorting: Advanced query capabilities by user, rating, and date
- Pagination: Data loading with customizable page sizes
- Timestamp Tracking: Automatic creation and update timestamps

#### Security & Performance
- CORS Configuration: Secure cross-origin resource sharing
- Rate Limiting: Protection against API abuse
- Environment Variables: Secure credential management
- Error Handling: Comprehensive error responses
- Input Validation: Request parameter validation

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

#### Get All Reviews
- GET /api/v1/reviews?page=1&limit=24&sort=date-newest&user=John

Parameters:
- `page` (optional): Page number (default: 1)
- `limit` (optional): Results per page (default: 24)
- `sort` (optional): `date-newest`, `date-oldest`, `rating-highest`, `rating-lowest`
- `user` (optional): Filter by username

#### Get Reviews by Media ID
- GET /api/v1/reviews/media/:id?season=1&episode=5

Parameters:
- `:id`: TMDB media ID
- `season` (optional): TV season number
- `episode` (optional): TV episode number

#### Get Single Review
- GET /api/v1/reviews/:id

Parameters:
- `:id`: MongoDB review ObjectId

#### Create Review
- POST /api/v1/reviews/new

Movie Review Example:

{
  "movieId": 550,
  "user": "John Doe",
  "review": "Amazing movie!",
  "rating": 9,
  "mediaType": "movie"
}

TV Show Review Example:

{
  "mediaId": 1399,
  "user": "Jane Smith",
  "review": "Best episode ever!",
  "rating": 10,
  "mediaType": "tv",
  "season": 1,
  "episode": 9
}

#### Update Review
- PUT /api/v1/reviews/:id

#### Delete Review
- DELETE /api/v1/reviews/:id

---

### Movies API (`/api/v1/movies`)

#### Trending Movies
- GET /api/v1/movies/trending/week?page=1
- GET /api/v1/movies/trending/day?page=1

#### Movie Categories
- GET /api/v1/movies/popular?page=1&language=en-US&region=US
- GET /api/v1/movies/now-playing?page=1
- GET /api/v1/movies/upcoming?page=1
- GET /api/v1/movies/top-rated?page=1

#### Movie Details
- GET /api/v1/movies/details/:id?language=en-US
  - Returns movie details with appended release dates.

#### Movie Credits
- GET /api/v1/movies/credits/:id?language=en-US
  - Returns cast and crew information.

---

### TV Shows API (`/api/v1/movies/tv`)

#### Popular TV Shows
- GET /api/v1/movies/tv/popular?page=1&language=en-US

#### TV Show Details
- GET /api/v1/movies/tv/details/:id?language=en-US
  - Returns TV show details with content ratings and external IDs.

#### TV Credits
- GET /api/v1/movies/tv/credits/:id
- GET /api/v1/movies/tv/aggregate_credits/:id
  - `credits`: Episode-specific cast/crew
  - `aggregate_credits`: Series-wide cast/crew with episode counts

#### TV Seasons
- GET /api/v1/movies/tv/seasons/:id
  - Returns all seasons for a TV show.

#### Season Episodes
- GET /api/v1/movies/tv/season/:id/:season
  - Returns all episodes for a specific season.

---

### People API (`/api/v1/movies/person`)

#### Person Details
- GET /api/v1/movies/person/:id?language=en-US
  - Returns biography and personal information.

#### Person Credits
- GET /api/v1/movies/person/:id/credits?language=en-US
  - Returns combined filmography (movies and TV shows).

---

### Search API

#### Multi-Search
- GET /api/v1/movies/search?query=inception&page=1&language=en-US&include_adult=false
  - Searches across movies, TV shows, and people.

## Database Schema

#### Reviews Collection

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

Indexes:
- `mediaId`: For fast media-specific queries
- `createdAt`: For chronological sorting
- Compound index on `mediaId + season + episode` for TV reviews

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

#### Data Access Layer
The application uses a Data Access Object (DAO) pattern to abstract database operations:
- reviewsDAO.js: Handles all MongoDB operations for reviews
- Centralized Logic: Business logic separated from routing
- Error Handling: Error responses across endpoints

#### API Proxy Pattern
The movies controller acts as a proxy to TMDB API:
- Rate Limiting: Protects against excessive requests
- Error Handling: Degradation on API failures
- Data Transformation: Formats TMDB responses for frontend needs
- Security: Hides API keys from client-side code

## Security

- Environment variables for sensitive credentials
- CORS configuration to restrict origin access
- Input validation on all endpoints
- MongoDB injection prevention via native driver
- Rate limiting on API endpoints
- Error messages that don't expose system details
- Secure MongoDB connection strings
- HTTPS enforcement (handled by Render)
- No sensitive data in version control

## Performance Optimizations

- Pagination: Limits database queries and response sizes
- Indexing: MongoDB indexes on frequently queried fields
- Connection Pooling: MongoDB connection pool (max 50)
- Lean Queries: Only fetching required fields from database

## Author

**Mario Mujica**

- GitHub: [@mariomujica99](https://github.com/mariomujica99)
- Backend Repository: [celestial-cinema-backend](https://github.com/mariomujica99/celestial-cinema-backend)
- LinkedIn: [www.linkedin.com/in/mario-mujica-903b19172]
- Email: mariomujica99@gmail.com

## Resources

- [The Movie Database (TMDB)](https://www.themoviedb.org/) for the comprehensive media API
- [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) for cloud database hosting
- [Render](https://render.com/) for reliable backend hosting
- [Express.js](https://expressjs.com/) community for excellent documentation

## Academic Integrity Notice

This personal project was built as a portfolio demonstration of full-stack development skills, including frontend design, backend API development, database management, and third-party API integration.
