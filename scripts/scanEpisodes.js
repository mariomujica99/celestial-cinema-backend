/**
 * Phase 4a: one-off local scan for seasonal episode candidates.
 *
 * Usage: node scripts/scanEpisodes.js
 *   Resolves seed shows to TMDB TV ids (writes scripts/output/shows.resolved.json),
 *   then scans them and writes scripts/output/candidates/<season>.json.
 *   Next: node scripts/approveEpisodes.js (Phase 4b).
 *
 * Do NOT run on the server.
 */

import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import seasonalConfig from '../api/seasonal.config.js';

dotenv.config();

const API_KEY = process.env['TMDB_API_KEY'];
const BASE_URL = 'https://api.themoviedb.org/3';
const REQUEST_DELAY_MS = 250;
const ANIMATION_GENRE_ID = 16;
const OVERVIEW_MAX_LENGTH = 200;
const TITLE_MATCH_WEIGHT = 2;

const SEED_SHOWS = [
  // Live action
  'The Office', 'Friends', 'Parks and Recreation', 'Brooklyn Nine-Nine', 'Modern Family',
  'How I Met Your Mother', 'Community', 'New Girl', 'The Big Bang Theory', 'Seinfeld',
  'Frasier', 'Cheers', 'Gilmore Girls', 'Supernatural', 'Buffy the Vampire Slayer',
  'Charmed', "Grey's Anatomy", 'Ghosts',
  // Animation
  'The Simpsons', 'Family Guy', 'American Dad!', "Bob's Burgers", 'South Park', 'Futurama',
  'King of the Hill', 'Rick and Morty', 'Archer', 'Solar Opposites', 'Big Mouth',
  'Adventure Time', 'SpongeBob SquarePants', 'Gravity Falls', 'Phineas and Ferb', 'Rugrats',
  'Hey Arnold!', 'The Loud House', 'Big City Greens',
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, 'output');
const RESOLVED_PATH = path.join(OUTPUT_DIR, 'shows.resolved.json');
const CANDIDATES_DIR = path.join(OUTPUT_DIR, 'candidates');

if (!API_KEY) {
  console.error('Error: TMDB_API_KEY not set in .env');
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findMatchedTerms(text, terms) {
  return terms.filter((term) => new RegExp(`\\b${escapeRegex(term)}\\b`, 'i').test(text));
}

function scoreEpisode(episode, terms) {
  const titleMatches = findMatchedTerms(episode.name ?? '', terms);
  const overviewMatches = findMatchedTerms(episode.overview ?? '', terms);
  return {
    titleMatches,
    overviewMatches,
    score: titleMatches.length * TITLE_MATCH_WEIGHT + overviewMatches.length,
  };
}

async function tmdbGet(endpoint, params = {}) {
  try {
    await sleep(REQUEST_DELAY_MS);
    const query = new URLSearchParams({ api_key: API_KEY, ...params });
    const response = await fetch(`${BASE_URL}${endpoint}?${query}`);
    if (!response.ok) {
      console.error(`TMDB error ${response.status} for ${endpoint}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(`Fetch error for ${endpoint}:`, error.message);
    return null;
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

async function resolveShow(seedName) {
  const data = await tmdbGet('/search/tv', { query: seedName });
  const match = data?.results?.[0];
  if (!match) {
    console.error(`No TMDB match for "${seedName}"`);
    return { seedName, id: null, name: null, firstAirDate: null, animation: false };
  }
  return {
    seedName,
    id: match.id,
    name: match.name,
    firstAirDate: match.first_air_date ?? null,
    animation: (match.genre_ids ?? []).includes(ANIMATION_GENRE_ID),
  };
}

async function runResolve() {
  const resolved = [];
  for (const seedName of SEED_SHOWS) {
    resolved.push(await resolveShow(seedName));
  }
  await writeJson(RESOLVED_PATH, resolved);
  return resolved.filter((show) => show.id);
}

function getSeasonScanConfigs() {
  return Object.values(seasonalConfig)
    .filter((season) => season.episodeTerms?.length)
    .map((season) => ({ key: season.key, episodeTerms: season.episodeTerms }));
}

function addEpisodeMatches(show, episode, seasonConfigs, candidatesBySeason) {
  for (const { key, episodeTerms } of seasonConfigs) {
    const { titleMatches, overviewMatches, score } = scoreEpisode(episode, episodeTerms);
    if (score === 0) {
      continue;
    }
    candidatesBySeason[key].push({
      showId: show.id,
      showName: show.name,
      animation: show.animation,
      seasonNumber: episode.season_number,
      episodeNumber: episode.episode_number,
      episodeTitle: episode.name,
      overview: (episode.overview ?? '').slice(0, OVERVIEW_MAX_LENGTH),
      airDate: episode.air_date ?? null,
      titleMatches,
      overviewMatches,
      score,
      approved: null,
    });
  }
}

async function scanShowSeasons(show, seasonConfigs, candidatesBySeason) {
  const details = await tmdbGet(`/tv/${show.id}`);
  const seasonNumbers = (details?.seasons ?? []).map((season) => season.season_number);
  for (const seasonNumber of seasonNumbers) {
    const seasonData = await tmdbGet(`/tv/${show.id}/season/${seasonNumber}`);
    for (const episode of seasonData?.episodes ?? []) {
      addEpisodeMatches(show, episode, seasonConfigs, candidatesBySeason);
    }
  }
}

async function runScan() {
  const shows = await runResolve();
  if (shows.length === 0) {
    console.error('No shows resolved. Check TMDB_API_KEY and network access.');
    return;
  }
  const seasonConfigs = getSeasonScanConfigs();
  const candidatesBySeason = Object.fromEntries(seasonConfigs.map(({ key }) => [key, []]));
  for (const show of shows) {
    await scanShowSeasons(show, seasonConfigs, candidatesBySeason);
  }
  for (const [seasonKey, candidates] of Object.entries(candidatesBySeason)) {
    candidates.sort((a, b) => b.score - a.score);
    await writeJson(path.join(CANDIDATES_DIR, `${seasonKey}.json`), candidates);
    console.log(`${seasonKey}: ${candidates.length} candidates`);
  }
}

async function main() {
  try {
    await runScan();
  } catch (error) {
    console.error('Episode scan failed:', error);
    process.exit(1);
  }
}

main();