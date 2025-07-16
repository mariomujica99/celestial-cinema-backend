import dotenv from 'dotenv'
dotenv.config()
import app from "./server.js"
import mongodb from "mongodb"
import ReviewsDAO from "./dao/reviewsDAO.js"

const MongoClient = mongodb.MongoClient
const mongo_username = process.env['MONGO_USERNAME']
const mongo_password = process.env['MONGO_PASSWORD']
const uri = `mongodb+srv://${mongo_username}:${mongo_password}@riocluster.ptet70v.mongodb.net/?retryWrites=true&w=majority&appName=RioCluster`

const port = 8000

MongoClient.connect(
  uri,
  {
    maxPoolSize: 50,
    wtimeoutMS: 2500,
  })
  .catch(err => {
    console.error(err.stack)
    process.exit(1)
  })
  .then(async client => {
    await ReviewsDAO.injectDB(client)
    app.listen(port, () => {
      console.log(`listening on port ${port}`)
    })
  })

/*
Curl commands for reviews on MongoDB

--add review--
curl -X POST http://localhost:8000/api/v1/reviews/new -H "Content-Type: application/json" -d '{"movieId": 404, "user": "John", "review": "I am not sure", "rating": 7}'

--get review information--
-end is an ObjectId-
curl -X GET http://localhost:8000/api/v1/reviews/68548ce5b815f72dabfdd2e3
-end is a movieId
curl -X GET http://localhost:8000/api/v1/reviews/media/404

--change a review--
curl -X PUT http://localhost:8000/api/v1/reviews/68548ce5b815f72dabfdd2e3 -H "Content-Type: application/json" -d '{"user": "John", "review": "It was okay", "rating": 6}'

--delete a review--
curl -X DELETE http://localhost:8000/api/v1/reviews/68548ce5b815f72dabfdd2e3

# Curl commands for TV show reviews

# Add TV show review for entire season (episode = null means "all episodes")
curl -X POST http://localhost:8000/api/v1/reviews/new -H "Content-Type: application/json" -d '{"mediaId": 1399, "user": "John", "review": "Great season overall", "rating": 8, "mediaType": "tv", "season": 1}'

# Add TV show review for specific episode
curl -X POST http://localhost:8000/api/v1/reviews/new -H "Content-Type: application/json" -d '{"mediaId": 1399, "user": "John", "review": "Amazing episode", "rating": 9, "mediaType": "tv", "season": 1, "episode": 5}'

# Get all reviews for a TV show
curl -X GET http://localhost:8000/api/v1/reviews/media/1399

# Get reviews for specific season
curl -X GET "http://localhost:8000/api/v1/reviews/media/1399?season=1"

# Get reviews for specific episode
curl -X GET "http://localhost:8000/api/v1/reviews/media/1399?season=1&episode=5"

# Update TV show review
curl -X PUT http://localhost:8000/api/v1/reviews/REVIEW_ID -H "Content-Type: application/json" -d '{"user": "John", "review": "Updated review", "rating": 7, "mediaType": "tv", "season": 1, "episode": 3}'

# Get TV show seasons
curl -X GET http://localhost:8000/api/v1/movies/tv/seasons/1399

# Get episodes for a specific season
curl -X GET http://localhost:8000/api/v1/movies/tv/season/1399/1
*/