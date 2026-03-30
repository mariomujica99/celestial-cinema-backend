import WatchlistDAO from "../dao/watchlistDAO.js"

export default class WatchlistController {
  static async apiGetWatchlist(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 200;
      const skip = (page - 1) * limit;

      const items = await WatchlistDAO.getAllItems(skip, limit);
      const totalCount = await WatchlistDAO.getItemsCount();

      res.json({
        items,
        hasMore: skip + items.length < totalCount,
        totalCount,
        currentPage: page
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }

  static async apiToggleWatchlist(req, res) {
    try {
      const { username, mediaId, title, year, mediaType, posterPath } = req.body;

      if (!username || !mediaId) {
        return res.status(400).json({ error: 'username and mediaId are required' });
      }

      const existing = await WatchlistDAO.checkItem(username, mediaId);

      if (existing) {
        await WatchlistDAO.removeItemByUserAndMedia(username, mediaId);
        return res.json({ status: 'removed' });
      }

      await WatchlistDAO.addItem(username, mediaId, title, year, mediaType, posterPath);
      res.json({ status: 'added' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }

  static async apiCheckWatchlist(req, res) {
    try {
      const { username, mediaId } = req.query;

      if (!username || !mediaId) {
        return res.status(400).json({ error: 'username and mediaId are required' });
      }

      const item = await WatchlistDAO.checkItem(username, mediaId);
      res.json({ inWatchlist: !!item, id: item ? item._id : null });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }

  static async apiRemoveFromWatchlist(req, res) {
    try {
      await WatchlistDAO.removeItemById(req.params.id);
      res.json({ status: 'success' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
}