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

  static async addReview(mediaId, user, review, rating, mediaType = 'movie', season = null, episode = null) {
    try {
      const reviewDoc = {
        mediaId: mediaId,
        user: user,
        review: review,
        rating: rating,
        mediaType: mediaType,
        createdAt: new Date()
      }

      if (mediaType === 'tv') {
        reviewDoc.season = season;
        reviewDoc.episode = episode;
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

  static async updateReview(reviewId, user, review, rating, season = null, episode = null) {
    try {
      const updateDoc = { 
        user: user, 
        review: review, 
        rating: rating, 
        updatedAt: new Date() 
      };

      if (season !== null) {
        updateDoc.season = season;
        updateDoc.episode = episode;
      }

      const updateResponse = await reviews.updateOne(
        { _id: new ObjectId(reviewId) },
        { $set: updateDoc }
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

  static async getReviewsByMediaId(mediaId) {
    try {
      const cursor = await reviews.find({ mediaId: parseInt(mediaId) })
      return cursor.toArray()
    } catch (e) {
      console.error(`Unable to get review: ${e}`)
      return { error: e }
    }
  }

  static async getReviewsByMovieId(movieId) {
    return this.getReviewsByMediaId(movieId);
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

  static async getReviewsByMediaIdWithFilter(mediaId, season = null, episode = null) {
    try {
      const query = { mediaId: parseInt(mediaId) };
      
      if (season !== null) {
        query.season = parseInt(season);
        
        if (episode !== null) {
          query.episode = parseInt(episode);
        }
      }

      const cursor = await reviews.find(query)
      return cursor.toArray()
    } catch (e) {
      console.error(`Unable to get reviews: ${e}`)
      return { error: e }
    }
  }
}