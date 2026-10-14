/**
 * Phase 4c: freeze approved episodes into api/seasonal.episodes.json.
 *
 * Reads scripts/output/candidates/<season>.json (approved entries only) and writes
 * one episodes array per season. The server never scans; it only serves this file.
 *
 * Usage: node scripts/freezeEpisodes.js   (run after approveEpisodes.js)
 *
 * Do NOT run on the server.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CANDIDATES_DIR = path.join(__dirname, 'output', 'candidates');
const FROZEN_PATH = path.join(__dirname, '..', 'api', 'seasonal.episodes.json');

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

async function freezeSeason(fileName) {
  const candidates = JSON.parse(await fs.readFile(path.join(CANDIDATES_DIR, fileName), 'utf8'));
  assertApproved(candidates, fileName);
  const episodes = candidates.filter((candidate) => candidate.approved).map(toFrozenEntry);
  return { seasonKey: path.basename(fileName, '.json'), episodes };
}

async function main() {
  try {
    const fileNames = (await fs.readdir(CANDIDATES_DIR)).filter((name) => name.endsWith('.json'));
    const frozen = {};
    for (const fileName of fileNames) {
      const { seasonKey, episodes } = await freezeSeason(fileName);
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