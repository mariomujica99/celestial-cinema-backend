import express from 'express';
import SimilarController from './similar.controller.js';

const router = express.Router();

router.route('/:mediaType/:id').get(SimilarController.apiGetSimilar);

export default router;