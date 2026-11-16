/**
 * Phase 4c: freeze approved episodes into api/seasonal.episodes.json.
 *
 * Reads scripts/output/candidates/<season>.json (approved entries only) for each season passed
 * on the command line, and replaces only those seasons in the frozen file. Other seasons' entries
 * are kept as they are, so re-freezing one season can never change another.
 * The server never scans; it only serves this file.
 *
 * Usage: node scripts/freezeEpisodes.js <season...>   (run after approveEpisodes.js)
 *
 * Do NOT run on the server.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseSeasonArgs } from './seasonArgs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CANDIDATES_DIR = path.join(__dirname, 'output', 'candidates');
const FROZEN_PATH = path.join(__dirname, '..', 'api', 'seasonal.episodes.json');

async function readExistingFrozen() {
  try {
    return JSON.parse(await fs.readFile(FROZEN_PATH, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function assertApproved(candidates, fileName) {
  if (candidates.some((candidate) => typeof candidate.approved !== 'boolean')) {
    throw new Error(`${fileName} has unapproved candidates. Run approveEpisodes.js first.`);
  }
}

function toFrozenEntry(candidate) {
  return {
    showId: candidate.showId,
    seasonNumber: candidate.seasonNumber,
    episodeNumber: candidate.episodeNumber,
  };
}

async function freezeSeason(seasonKey) {
  const fileName = `${seasonKey}.json`;
  const candidates = JSON.parse(await fs.readFile(path.join(CANDIDATES_DIR, fileName), 'utf8'));
  assertApproved(candidates, fileName);
  return candidates.filter((candidate) => candidate.approved).map(toFrozenEntry);
}

async function main() {
  try {
    const seasonKeys = parseSeasonArgs('freezeEpisodes.js');
    const frozen = await readExistingFrozen();
    for (const seasonKey of seasonKeys) {
      const episodes = await freezeSeason(seasonKey);
      frozen[seasonKey] = { episodes };
      console.log(`${seasonKey}: ${episodes.length} episodes frozen`);
    }
    await fs.writeFile(FROZEN_PATH, JSON.stringify(frozen, null, 2) + '\n');
    console.log(`Wrote ${FROZEN_PATH}`);
  } catch (error) {
    console.error('Freeze failed:', error.message);
    process.exit(1);
  }
}

main();