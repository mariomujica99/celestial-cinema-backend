import express from "express"
import WatchlistCtrl from "./watchlist.controller.js"

const router = express.Router()

router.route("/").get(WatchlistCtrl.apiGetWatchlist)
router.route("/toggle").post(WatchlistCtrl.apiToggleWatchlist)
router.route("/check").get(WatchlistCtrl.apiCheckWatchlist)
router.route("/:id").delete(WatchlistCtrl.apiRemoveFromWatchlist)

export default router