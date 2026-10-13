import express from 'express';
import SeasonalController from './seasonal.controller.js';

const router = express.Router();

// GET /seasonal/:season
router.route('/:season').get(SeasonalController.apiGetSeasonalRails);

// GET /seasonal/:season/hero
router.route('/:season/hero').get(SeasonalController.apiGetSeasonalHero);

// GET /seasonal/:season/rail/:railKey
router.route('/:season/rail/:railKey').get(SeasonalController.apiGetSeasonalRail);

// GET /seasonal/:season/streaming/:providerId
router.route('/:season/streaming/:providerId').get(SeasonalController.apiGetSeasonalStreaming);

// GET /seasonal/:season/new
router.route('/:season/new').get(SeasonalController.apiGetSeasonalNew);

// GET /seasonal/:season/episodes
router.route('/:season/episodes').get(SeasonalController.apiGetSeasonalEpisodes);

// GET /seasonal/:season/watchlist-match
router.route('/:season/watchlist-match').get(SeasonalController.apiGetSeasonalWatchlistMatch);

export default router;