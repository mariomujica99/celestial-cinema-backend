/**
 * Shared season argument parsing for the seasonal scripts.
 *
 * Every script takes explicit season keys (e.g. `halloween`). With no keys, or with an unknown key,
 * it prints usage and exits, so no script runs for every season by accident.
 */

import seasonalConfig from '../api/seasonal.config.js';

export function parseSeasonArgs(scriptName, argv = process.argv.slice(2)) {
  const available = Object.keys(seasonalConfig);

  if (argv.length === 0) {
    console.error(`Usage: node scripts/${scriptName} <season...>\nAvailable seasons: ${available.join(', ')}`);
    process.exit(1);
  }

  const unknown = argv.filter((key) => !available.includes(key));
  if (unknown.length > 0) {
    console.error(`Unknown season(s): ${unknown.join(', ')}. Available seasons: ${available.join(', ')}`);
    process.exit(1);
  }

  return [...new Set(argv)];
}
