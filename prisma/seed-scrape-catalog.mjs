/**
 * Seeds ScrapeIndustries and ScrapeCities from the Scraper repository's CSVs.
 * Idempotent: skips rows that already exist, so it is safe to re-run after the
 * source lists grow.
 *
 *   node prisma/seed-scrape-catalog.mjs --source ../Scraper [--apply]
 *
 * Without --apply it reports what would change and writes nothing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const source = args[args.indexOf('--source') + 1] ?? '../Scraper';

const TIMEZONES = ['pst', 'mst', 'cst', 'est', 'hst'];

function readLines(path) {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * keywords.csv stores "&" pre-encoded as "%26" for 7 of its entries. The
 * scraper URL-encodes again on top, and YellowPages tolerates the result, but
 * the raw value would reach Businesses.Industry and show up in the calling UI.
 * Decode once here so the queue carries clean text.
 */
function decodeIndustry(name) {
  return name.replace(/%26/g, '&');
}

function parseCity(line) {
  const at = line.lastIndexOf(' ');
  const city = line.slice(0, at);
  const state = line.slice(at + 1);
  if (!city || !/^[A-Z]{2}$/.test(state)) {
    throw new Error(`Unparseable city line: ${line}`);
  }
  return { city, state };
}

const prisma = new PrismaClient();

try {
  const industries = [...new Set(readLines(join(source, 'keywords.csv')).map(decodeIndustry))];

  const cities = [];
  const seen = new Set();
  for (const tz of TIMEZONES) {
    for (const line of readLines(join(source, `${tz}.csv`))) {
      const { city, state } = parseCity(line);
      const key = `${city}|${state}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cities.push({ city, state, timeZone: tz.toUpperCase() });
    }
  }

  const [haveIndustries, haveCities] = await Promise.all([
    prisma.scrapeIndustry.findMany({ select: { name: true } }),
    prisma.scrapeCity.findMany({ select: { city: true, state: true } }),
  ]);
  const haveIndustryNames = new Set(haveIndustries.map((i) => i.name));
  const haveCityKeys = new Set(haveCities.map((c) => `${c.city}|${c.state.trim()}`));

  const newIndustries = industries.filter((n) => !haveIndustryNames.has(n));
  const newCities = cities.filter((c) => !haveCityKeys.has(`${c.city}|${c.state}`));

  console.log(`source: ${source}`);
  console.log(`industries: ${industries.length} in source, ${newIndustries.length} new`);
  console.log(`cities:     ${cities.length} in source, ${newCities.length} new`);
  console.log(`states:     ${new Set(cities.map((c) => c.state)).size}`);

  if (!apply) {
    console.log('\nDry run. Pass --apply to write.');
  } else {
    if (newIndustries.length) {
      await prisma.scrapeIndustry.createMany({ data: newIndustries.map((name) => ({ name })) });
    }
    // Chunked: SQL Server caps a parameterized statement at 2100 parameters.
    for (let i = 0; i < newCities.length; i += 500) {
      await prisma.scrapeCity.createMany({ data: newCities.slice(i, i + 500) });
    }
    const [ni, nc] = await Promise.all([prisma.scrapeIndustry.count(), prisma.scrapeCity.count()]);
    console.log(`\nWrote. Totals now: ${ni} industries, ${nc} cities.`);
  }
} finally {
  await prisma.$disconnect();
}
