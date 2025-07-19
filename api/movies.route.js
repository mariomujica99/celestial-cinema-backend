import express from "express"
import MoviesCtrl from "./movies.controller.js"

const router = express.Router()

router.route("/trending/week").get(MoviesCtrl.apiGetTrendingWeek)
router.route("/trending/day").get(MoviesCtrl.apiGetTrendingDay)
router.route("/popular").get(MoviesCtrl.apiGetPopular)
router.route("/now-playing").get(MoviesCtrl.apiGetNowPlaying)
router.route("/upcoming").get(MoviesCtrl.apiGetUpcoming)
router.route("/top-rated").get(MoviesCtrl.apiGetTopRated)
router.route("/tv/popular").get(MoviesCtrl.apiGetPopularTV)
router.route("/search").get(MoviesCtrl.apiSearchMulti)
router.route("/details/:id").get(MoviesCtrl.apiGetMovieDetails)
router.route("/credits/:id").get(MoviesCtrl.apiGetMovieCredits)
router.route("/tv/details/:id").get(MoviesCtrl.apiGetTVDetails)
router.route("/tv/credits/:id").get(MoviesCtrl.apiGetTVCredits)
router.route("/tv/seasons/:id").get(MoviesCtrl.apiGetTVSeasons)
router.route("/tv/season/:id/:season").get(MoviesCtrl.apiGetTVSeasonEpisodes)
router.route("/person/:id").get(MoviesCtrl.apiGetPersonDetails)
router.route("/person/:id/credits").get(MoviesCtrl.apiGetPersonCredits)
router.route("/tv/aggregate_credits/:id").get(MoviesCtrl.apiGetTVAggregateCredits)

export default router