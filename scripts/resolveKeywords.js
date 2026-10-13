/**
 * One-off script to resolve keyword names to TMDB keyword IDs.
 * Reads seasonal.config.js, looks up each keyword name via TMDB, and updates resolvedKeywords.
 * Logs keyword usage counts to help identify thin keywords that should be replaced.
 *
 * Usage: node scripts/resolveKeywords.js
 *
 * Do NOT run on the server. Run locally, review the output, then commit the updated config.
 */

import dotenv from 'dotenv';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

const API_KEY = process.env['TMDB_API_KEY'];
const BASE_URL = 'https://api.themoviedb.org/3';
const CONFIG_PATH = '../api/seasonal.config.js';

if (!API_KEY) {
  console.error('Error: TMDB_API_KEY not set in .env');
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Search TMDB for a keyword by name.
 */
async function searchKeyword(keywordName) {
  try {
    const url = `${BASE_URL}/search/keyword?api_key=${API_KEY}&query=${encodeURIComponent(keywordName)}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`TMDB error for '${keywordName}': ${response.status}`);
      return null;
    }
    const data = await response.json();
    if (data.results && data.results.length > 0) {
      return data.results[0]; // TMDB returns best match first
    }
    return null;
  } catch (error) {
    console.error(`Fetch error for '${keywordName}':`, error.message);
    return null;
  }
}

/**
 * Get usage count for a keyword ID (number of titles with that keyword).
 * This is a best-effort estimate using discover with that keyword.
 */
async function getKeywordUsageCount(keywordId) {
  try {
    // Sample one page; total_results gives us the count
    const url = `${BASE_URL}/discover/movie?api_key=${API_KEY}&with_keywords=${keywordId}&page=1`;
    const response = await fetch(url);
    if (!response.ok) return 0;
    const data = await response.json();
    return data.total_results || 0;
  } catch (error) {
    return 0;
  }
}

/**
 * Resolve all keyword groups for a season.
 */
async function resolveSeasonKeywords(seasonKey, seasonData) {
  console.log(`\n=== Resolving keywords for ${seasonKey.toUpperCase()} ===`);

  const resolvedKeywords = {};
  const report = [];

  for (const [groupName, keywordNames] of Object.entries(seasonData.keywordGroups)) {
    console.log(`\nGroup: ${groupName}`);
    const ids = [];

    for (const keywordName of keywordNames) {
      process.stdout.write(`  Searching '${keywordName}'... `);
      const result = await searchKeyword(keywordName);

      if (result) {
        const usageCount = await getKeywordUsageCount(result.id);
        ids.push(result.id);
        console.log(`✓ ID: ${result.id} (${usageCount} titles)`);
        report.push({
          group: groupName,
          keyword: keywordName,
          id: result.id,
          usageCount,
          status: usageCount < 10 ? 'THIN (consider replacing)' : 'OK',
        });
      } else {
        console.log('✗ NOT FOUND');
        report.push({
          group: groupName,
          keyword: keywordName,
          id: null,
          usageCount: 0,
          status: 'MISSING',
        });
      }
    }

    resolvedKeywords[groupName] = ids;
  }

  // Print report
  console.log('\n--- Keyword Resolution Report ---');
  console.table(report);

  // Check for thin keywords
  const thinKeywords = report.filter(r => r.usageCount > 0 && r.usageCount < 10);
  if (thinKeywords.length > 0) {
    console.warn('\n⚠️  Thin keywords (< 10 titles). Consider replacing before launch:');
    thinKeywords.forEach(kw => {
      console.warn(`   ${kw.group}: '${kw.keyword}' (${kw.usageCount} titles)`);
    });
  }

  // Check for missing keywords
  const missingKeywords = report.filter(r => !r.id);
  if (missingKeywords.length > 0) {
    console.error('\n❌ Missing keywords (not found in TMDB):');
    missingKeywords.forEach(kw => {
      console.error(`   ${kw.group}: '${kw.keyword}'`);
    });
  }

  return { resolvedKeywords, report };
}

/**
 * Main: Resolve all seasons and update config.
 */
async function main() {
  try {
    // Dynamically import config
    const configModule = await import(CONFIG_PATH);
    const seasonalConfig = configModule.default;

    console.log('📍 Starting keyword resolution...');
    console.log(`🔑 API Key: ${API_KEY.slice(0, 8)}...`);

    const allResults = {};

    for (const [seasonKey, seasonData] of Object.entries(seasonalConfig)) {
      const { resolvedKeywords } = await resolveSeasonKeywords(seasonKey, seasonData);
      allResults[seasonKey] = resolvedKeywords;
    }

    console.log('\n\n=== FINAL OUTPUT ===');
    console.log('Copy this into seasonal.config.js resolvedKeywords fields:\n');
    console.log(JSON.stringify(allResults, null, 2));

    console.log('\n✅ Resolution complete. Review the output above, then manually update seasonal.config.js');
    console.log('   and re-deploy to Render.');
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();