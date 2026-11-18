/**
 * Unit tests for the seasonal discover filter builders. No network: these only check URL params.
 * Run with: node --test api/seasonal.filters.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import SeasonalController from './seasonal.controller.js';

const KEYWORDS = {
  A: [1, 2],
  B: [3],
};

const params = (url) => new URL(`https://example.test${url}`).searchParams;

test('default discover keeps popularity sort and the default vote floor', () => {
  const url = SeasonalController.buildDiscoverEndpoint('movie', {}, KEYWORDS, 1);
  assert.equal(params(url).get('sort_by'), 'popularity.desc');
  assert.equal(params(url).get('vote_count.gte'), '50');
  assert.equal(params(url).get('region'), 'US');
});

test('sortBy overrides the default sort', () => {
  const url = SeasonalController.buildDiscoverEndpoint('tv', { sortBy: 'vote_average.desc' }, KEYWORDS, 1);
  assert.equal(params(url).get('sort_by'), 'vote_average.desc');
});

test('minVoteCount raises the vote floor but never lowers it', () => {
  const higher = SeasonalController.buildDiscoverEndpoint('movie', { minVoteCount: 200 }, KEYWORDS, 1);
  assert.equal(params(higher).get('vote_count.gte'), '200');

  const lower = SeasonalController.buildDiscoverEndpoint('movie', { minVoteCount: 10 }, KEYWORDS, 1);
  assert.equal(params(lower).get('vote_count.gte'), '50');

  const tvDefault = SeasonalController.buildDiscoverEndpoint('tv', { minVoteCount: 30 }, KEYWORDS, 1);
  assert.equal(params(tvDefault).get('vote_count.gte'), '30');
});

test('minVoteAverage adds vote_average.gte, and is absent otherwise', () => {
  const withRating = SeasonalController.buildDiscoverEndpoint('movie', { minVoteAverage: 6.5 }, KEYWORDS, 1);
  assert.equal(params(withRating).get('vote_average.gte'), '6.5');

  const without = SeasonalController.buildDiscoverEndpoint('movie', {}, KEYWORDS, 1);
  assert.equal(params(without).has('vote_average.gte'), false);
});

test('genreOp OR uses pipe, default AND uses comma', () => {
  const or = SeasonalController.buildDiscoverEndpoint('movie', { genres: ['Family', 'Comedy'], genreOp: 'OR' }, KEYWORDS, 1);
  assert.equal(params(or).get('with_genres'), '10751|35');

  const and = SeasonalController.buildDiscoverEndpoint('movie', { genres: ['Comedy', 'Drama'] }, KEYWORDS, 1);
  assert.equal(params(and).get('with_genres'), '35,18');
});

test('keyword groups default to OR, keywordOp AND uses comma, and AND fails closed when unresolved', () => {
  const or = SeasonalController.buildDiscoverEndpoint('tv', { keywords: ['A', 'B'] }, KEYWORDS, 1);
  assert.equal(params(or).get('with_keywords'), '1|2|3');

  const and = SeasonalController.buildDiscoverEndpoint('tv', { keywords: ['A', 'B'], keywordOp: 'AND' }, KEYWORDS, 1);
  assert.equal(params(and).get('with_keywords'), '1|2,3');

  assert.throws(
    () => SeasonalController.buildDiscoverEndpoint('tv', { keywords: ['A', 'MISSING'], keywordOp: 'AND' }, KEYWORDS, 1),
    /Unresolved keyword group/
  );
});

test('keywordExclusions become without_keywords', () => {
  const url = SeasonalController.buildDiscoverEndpoint('tv', { keywordExclusions: ['B'] }, KEYWORDS, 1);
  assert.equal(params(url).get('without_keywords'), '3');
});

test('releaseDateBefore is exclusive: the cutoff is the day before, using lte', () => {
  const movie = SeasonalController.buildDiscoverEndpoint('movie', { releaseDateBefore: '1990-01-01' }, KEYWORDS, 1);
  assert.equal(params(movie).get('primary_release_date.lte'), '1989-12-31');
  assert.equal(params(movie).has('first_air_date.lte'), false);

  const tv = SeasonalController.buildDiscoverEndpoint('tv', { releaseDateBefore: '1990-01-01' }, KEYWORDS, 1);
  assert.equal(params(tv).get('first_air_date.lte'), '1989-12-31');
  assert.equal(params(tv).has('primary_release_date.lte'), false);
});

test('streaming and new-this-year base filters apply the same helper, with region=US', () => {
  const base = { genres: ['Comedy'], keywords: ['A'] };
  const streaming = SeasonalController.buildStreamingEndpoint('movie', 8, base, KEYWORDS, 1);
  assert.equal(params(streaming).get('region'), 'US');
  assert.equal(params(streaming).get('with_genres'), '35');
  assert.equal(params(streaming).get('with_keywords'), '1|2');

  const newThisYear = SeasonalController.buildNewThisYearEndpoint('tv', base, KEYWORDS, 2026, 1);
  assert.equal(params(newThisYear).get('first_air_date_year'), '2026');
  assert.equal(params(newThisYear).get('region'), 'US');
});
