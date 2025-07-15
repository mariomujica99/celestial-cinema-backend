import express from "express"
import ReviewsCtrl from "./reviews.controller.js"

const router = express.Router()

//router.route("/").get((req, res) => res.send("hello world"))
router.route("/").get(ReviewsCtrl.apiGetAllReviews)
router.route("/media/:id").get(ReviewsCtrl.apiGetReviews)
router.route("/new").post(ReviewsCtrl.apiPostReview)
router.route("/:id")
  .get(ReviewsCtrl.apiGetReview)
  .put(ReviewsCtrl.apiUpdateReview)
  .delete(ReviewsCtrl.apiDeleteReview)

export default router