/**
 * Phase 4b: automatic approval of episode candidates. No manual review.
 *
 * Rule: an episode is approved when at least one season term appears in its title.
 * Overview-only matches stay in the candidates file with approved: false.
 * Approved entries are ordered by title matches, then score.
 *
 * Usage: node scripts/approveEpisodes.js   (run after scanEpisodes.js)
 *
 * Do NOT run on the server.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CANDIDATES_DIR = path.join(__dirname, 'output', 'candidates');

function isApproved(candidate) {
  return candidate.titleMatches.length > 0;
}

function compareForDisplay(a, b) {
  return b.titleMatches.length - a.titleMatches.length || b.score - a.score;
}

async function approveSeasonFile(fileName) {
  const filePath = path.join(CANDIDATES_DIR, fileName);
  const candidates = JSON.parse(await fs.readFile(filePath, 'utf8'));
  for (const candidate of candidates) {
    candidate.approved = isApproved(candidate);
  }
  candidates.sort(compareForDisplay);
  await fs.writeFile(filePath, JSON.stringify(candidates, null, 2));
  const approvedCount = candidates.filter((candidate) => candidate.approved).length;
  console.log(`${fileName}: ${approvedCount} approved of ${candidates.length} candidates`);
}

async function main() {
  try {
    const fileNames = (await fs.readdir(CANDIDATES_DIR)).filter((name) => name.endsWith('.json'));
    for (const fileName of fileNames) {
      await approveSeasonFile(fileName);
    }
  } catch (error) {
    console.error(`Could not approve candidates in ${CANDIDATES_DIR}. Run scanEpisodes.js first.`, error.message);
    process.exit(1);
  }
}

main();