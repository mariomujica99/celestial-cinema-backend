import mongodb from "mongodb"
const ObjectId = mongodb.ObjectId

let reviews

export default class ReviewsDAO {
  static async injectDB(conn) {
    if (reviews) {
      return
    }
    try {
      reviews = await conn.db("reviews").collection("reviews")
    } catch (e) {
      console.error(`Unable to establish collection handles in userDAO: ${e}`)
    }
  }

  static async addReview(movieId, user, review, rating) {
    try {
      const reviewDoc = {
        movieId: movieId,
        user: user,
        review: review,
        rating: rating,
        createdAt: new Date()
      }

      return await reviews.insertOne(reviewDoc)
    } catch (e) {
      console.error(`Unable to post review: ${e}`)
      return { error: e }
    }
  }

  static async getReview(reviewId) {
    try {
      return await reviews.findOne({ _id: new ObjectId(reviewId) })
    } catch (e) {
      console.error(`Unable to get review: ${e}`)
      return { error: e }
    }
  }

  static async updateReview(reviewId, user, review, rating) {
    try {
      const updateResponse = await reviews.updateOne(
        { _id: new ObjectId(reviewId) },
        { $set: { user: user, review: review, rating: rating, updatedAt: new Date() } }
      )

      return updateResponse
    } catch (e) {
      console.error(`Unable to update review: ${e}`)
      return { error: e }
    }
  }

  static async deleteReview(reviewId) {
    try {
      const deleteResponse = await reviews.deleteOne({
        _id: new ObjectId(reviewId),
      })

      return deleteResponse
    } catch (e) {
      console.error(`Unable to delete review: ${e}`)
      return { error: e }
    }
  }

  static async getReviewsByMovieId(movieId) {
    try {
      const cursor = await reviews.find({ movieId: parseInt(movieId) })
      return cursor.toArray()
    } catch (e) {
      console.error(`Unable to get review: ${e}`)
      return { error: e }
    }
  }

  static async getAllReviews(skip = 0, limit = 24) {
    try {
      const cursor = await reviews.find({})
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
      return cursor.toArray()
    } catch (e) {
      console.error(`Unable to get all reviews: ${e}`)
      return { error: e }
    }
  }

  static async getReviewsCount() {
    try {
      return await reviews.countDocuments({})
    } catch (e) {
      console.error(`Unable to get reviews count: ${e}`)
      return 0
    }
  }
}