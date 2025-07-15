import ReviewsDAO from "../dao/reviewsDAO.js"

export default class ReviewsController {
  static async apiPostReview(req, res, next) {
    try {
      const movieId = parseInt(req.body.movieId)
      const review = req.body.review
      const user = req.body.user
      const rating = parseInt(req.body.rating) || 0

      const reviewResponse = await ReviewsDAO.addReview(
        movieId,
        user,
        review,
        rating
      )
      res.json({ status: "success" })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  }

  static async apiGetReview(req, res, next) {
    try {
      let id = req.params.id || {}
      let review = await ReviewsDAO.getReview(id)
      if (!review) {
        res.status(404).json({ error: "Not found" })
        return
      }
      res.json(review)
    } catch (e) {
      console.log(`api, ${e}`)
      res.status(500).json({ error: e })
    }
  }

  static async apiUpdateReview(req, res, next) {
    try {
      const reviewId = req.params.id
      const review = req.body.review
      const user = req.body.user
      const rating = parseInt(req.body.rating) || 0

      const reviewResponse = await ReviewsDAO.updateReview(
        reviewId,
        user,
        review,
        rating
      )

      var { error } = reviewResponse
      if (error) {
        res.status(400).json({ error })
      }

      if (reviewResponse.modifiedCount === 0) {
        throw new Error(
          "Unable to update review",
        )
      }

      res.json({ status: "success" })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  }

  static async apiDeleteReview(req, res, next) {
    try {
      const reviewId = req.params.id
      const reviewResponse = await ReviewsDAO.deleteReview(reviewId)
      res.json({ status: "success" })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  }

  static async apiGetReviews(req, res, next) {
    try {
      let id = req.params.id || {}
      let reviews = await ReviewsDAO.getReviewsByMovieId(id)
      if (!reviews) {
        res.status(404).json({ error: "Not found" })
        return
      }
      res.json(reviews)
    } catch (e) {
      console.log(`api, ${e}`)
      res.status(500).json({ error: e })
    }
  }

  static async apiGetAllReviews(req, res, next) {
    try {
      const page = parseInt(req.query.page) || 1
      const limit = parseInt(req.query.limit) || 24
      const skip = (page - 1) * limit

      const reviews = await ReviewsDAO.getAllReviews(skip, limit)
      const totalCount = await ReviewsDAO.getReviewsCount()
      
      const hasMore = skip + reviews.length < totalCount

      res.json({
        reviews: reviews,
        hasMore: hasMore,
        currentPage: page,
        totalCount: totalCount
      })
    } catch (e) {
      console.log(`api, ${e}`)
      res.status(500).json({ error: e.message })
    }
  }
}