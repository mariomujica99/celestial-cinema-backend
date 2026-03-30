import express from "express"
import cors from "cors"
import rateLimit from "express-rate-limit"
import reviews from "./api/reviews.route.js"
import movies from "./api/movies.route.js"
import watchlist from "./api/watchlist.route.js"

const app = express()

app.use(cors())
app.use(express.json())

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again in a few minutes." }
})

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many write requests. Please try again in a few minutes." }
})

app.use(globalLimiter)

app.use("/api/v1/reviews", (req, res, next) => {
  if (req.method === "POST" || req.method === "PUT" || req.method === "DELETE") {
    return writeLimiter(req, res, next)
  }
  next()
})

app.use("/api/v1/reviews", reviews)
app.use("/api/v1/movies", movies)
app.use("/api/v1/watchlist", watchlist)
app.use("*", (req, res) => res.status(404).json({ error: "not found" }))

export default app