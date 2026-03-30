import mongodb from "mongodb"
const ObjectId = mongodb.ObjectId

let watchlist

export default class WatchlistDAO {
  static async injectDB(conn) {
    if (watchlist) return;
    try {
      watchlist = await conn.db("reviews").collection("watchlist")
    } catch (e) {
      console.error(`Unable to establish watchlist collection: ${e}`)
    }
  }

  static async addItem(username, mediaId, title, year, mediaType, posterPath) {
    try {
      const existing = await watchlist.findOne({
        username: username.toLowerCase(),
        mediaId: String(mediaId)
      });
      if (existing) return { alreadyExists: true, _id: existing._id };

      const doc = {
        username: username.toLowerCase(),
        mediaId: String(mediaId),
        title,
        year,
        mediaType,
        posterPath,
        addedAt: new Date()
      };
      return await watchlist.insertOne(doc);
    } catch (e) {
      console.error(`Unable to add watchlist item: ${e}`)
      return { error: e }
    }
  }

  static async removeItemById(id) {
    try {
      return await watchlist.deleteOne({ _id: new ObjectId(id) });
    } catch (e) {
      console.error(`Unable to remove watchlist item: ${e}`)
      return { error: e }
    }
  }

  static async removeItemByUserAndMedia(username, mediaId) {
    try {
      return await watchlist.deleteOne({
        username: username.toLowerCase(),
        mediaId: String(mediaId)
      });
    } catch (e) {
      console.error(`Unable to remove watchlist item: ${e}`)
      return { error: e }
    }
  }

  static async getAllItems(skip = 0, limit = 200) {
    try {
      const cursor = await watchlist.find({})
        .sort({ addedAt: -1 })
        .skip(skip)
        .limit(limit);
      return cursor.toArray();
    } catch (e) {
      console.error(`Unable to get watchlist: ${e}`)
      return { error: e }
    }
  }

  static async getItemsCount() {
    try {
      return await watchlist.countDocuments({});
    } catch (e) {
      console.error(`Unable to get watchlist count: ${e}`)
      return 0;
    }
  }

  static async checkItem(username, mediaId) {
    try {
      return await watchlist.findOne({
        username: username.toLowerCase(),
        mediaId: String(mediaId)
      });
    } catch (e) {
      console.error(`Unable to check watchlist item: ${e}`)
      return null;
    }
  }
}