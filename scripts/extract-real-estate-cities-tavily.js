#!/usr/bin/env node

/*
 * Extract project cities from an Israeli real-estate brand site using Tavily.
 *
 * Usage:
 *   TAVILY_API_KEY=... node scripts/extract-real-estate-cities-tavily.js https://electra-megurim.com/
 *
 * The script intentionally uses high-confidence page signals only:
 * - project index pages discovered with Tavily search/extract
 * - portfolio/project URLs found in extracted index content
 * - extracted project page title/H1/first headings
 *
 * It avoids scanning full project page bodies for cities because those pages often
 * contain related-project links, footers, and news blocks that mention other cities.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_SITE = 'https://electra-megurim.com/';

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .filter(line => line && !line.trim().startsWith('#') && line.includes('='))
      .map(line => {
        const index = line.indexOf('=');
        return [
          line.slice(0, index).trim(),
          line.slice(index + 1).trim().replace(/^["']|["']$/g, ''),
        ];
      }),
  );
}

function loadEnv() {
  const cwd = process.cwd();
  return {
    ...parseEnvFile(path.join(cwd, '.env.local')),
    ...parseEnvFile(path.join(cwd, 'be-visible.ai-main (2)', '.env.local')),
    ...process.env,
  };
}

function h(value) {
  return JSON.parse(`"${value}"`);
}

const CITY_ALIASES = [
  [h('\\u05ea\\u05dc \\u05d0\\u05d1\\u05d9\\u05d1'), h('\\u05ea\\u05dc \\u05d0\\u05d1\\u05d9\\u05d1')],
  [h('\\u05ea\\u05dc-\\u05d0\\u05d1\\u05d9\\u05d1'), h('\\u05ea\\u05dc \\u05d0\\u05d1\\u05d9\\u05d1')],
  ['tel aviv', h('\\u05ea\\u05dc \\u05d0\\u05d1\\u05d9\\u05d1')],
  ['tel-aviv', h('\\u05ea\\u05dc \\u05d0\\u05d1\\u05d9\\u05d1')],
  [h('\\u05e9\\u05d3\\u05d4 \\u05d3\\u05d1'), h('\\u05ea\\u05dc \\u05d0\\u05d1\\u05d9\\u05d1')],
  [h('\\u05e6\\u05e4\\u05d5\\u05df \\u05ea\\u05dc \\u05d0\\u05d1\\u05d9\\u05d1'), h('\\u05ea\\u05dc \\u05d0\\u05d1\\u05d9\\u05d1')],
  ['midtown', h('\\u05ea\\u05dc \\u05d0\\u05d1\\u05d9\\u05d1')],
  ['w-prime', h('\\u05ea\\u05dc \\u05d0\\u05d1\\u05d9\\u05d1')],

  [h('\\u05e8\\u05de\\u05ea \\u05d2\\u05df'), h('\\u05e8\\u05de\\u05ea \\u05d2\\u05df')],
  [h('\\u05e4\\u05d0\\u05e8\\u05e7 \\u05d0\\u05e4\\u05e2\\u05dc'), h('\\u05e8\\u05de\\u05ea \\u05d2\\u05df')],
  [h('\\u05ea\\u05dc \\u05d4\\u05e9\\u05d5\\u05de\\u05e8'), h('\\u05e8\\u05de\\u05ea \\u05d2\\u05df')],

  [h('\\u05d2\\u05d1\\u05e2\\u05ea \\u05e9\\u05de\\u05d5\\u05d0\\u05dc'), h('\\u05d2\\u05d1\\u05e2\\u05ea \\u05e9\\u05de\\u05d5\\u05d0\\u05dc')],
  ['givat-shmuel', h('\\u05d2\\u05d1\\u05e2\\u05ea \\u05e9\\u05de\\u05d5\\u05d0\\u05dc')],
  [h('\\u05e8\\u05de\\u05ea \\u05d4\\u05d3\\u05e8'), h('\\u05d2\\u05d1\\u05e2\\u05ea \\u05e9\\u05de\\u05d5\\u05d0\\u05dc')],

  [h('\\u05d4\\u05d5\\u05d3 \\u05d4\\u05e9\\u05e8\\u05d5\\u05df'), h('\\u05d4\\u05d5\\u05d3 \\u05d4\\u05e9\\u05e8\\u05d5\\u05df')],
  ['hod-hasharon', h('\\u05d4\\u05d5\\u05d3 \\u05d4\\u05e9\\u05e8\\u05d5\\u05df')],

  [h('\\u05e8\\u05d0\\u05e9\\u05d5\\u05df \\u05dc\\u05e6\\u05d9\\u05d5\\u05df'), h('\\u05e8\\u05d0\\u05e9\\u05d5\\u05df \\u05dc\\u05e6\\u05d9\\u05d5\\u05df')],
  [h('\\u05de\\u05ea\\u05d7\\u05dd \\u05d4-1000'), h('\\u05e8\\u05d0\\u05e9\\u05d5\\u05df \\u05dc\\u05e6\\u05d9\\u05d5\\u05df')],
  [h('\\u05de\\u05ea\\u05d7\\u05dd \\u05d4 1000'), h('\\u05e8\\u05d0\\u05e9\\u05d5\\u05df \\u05dc\\u05e6\\u05d9\\u05d5\\u05df')],
  [h('\\u05de\\u05ea\\u05d7\\u05dd \\u05d4\\u05d0\\u05dc\\u05e3'), h('\\u05e8\\u05d0\\u05e9\\u05d5\\u05df \\u05dc\\u05e6\\u05d9\\u05d5\\u05df')],

  [h('\\u05d1\\u05ea \\u05d9\\u05dd'), h('\\u05d1\\u05ea \\u05d9\\u05dd')],
  [h('\\u05e4\\u05d0\\u05e8\\u05e7 \\u05d4\\u05d9\\u05dd'), h('\\u05d1\\u05ea \\u05d9\\u05dd')],
  [h('\\u05e7\\u05e8\\u05e0\\u05d9 \\u05d9\\u05dd'), h('\\u05d1\\u05ea \\u05d9\\u05dd')],
  [h('\\u05e9\\u05de\\u05d5\\u05e8\\u05ea \\u05d4\\u05d9\\u05dd'), h('\\u05d1\\u05ea \\u05d9\\u05dd')],

  [h('\\u05e0\\u05ea\\u05e0\\u05d9\\u05d4'), h('\\u05e0\\u05ea\\u05e0\\u05d9\\u05d4')],
  ['green-park', h('\\u05ea\\u05dc \\u05d0\\u05d1\\u05d9\\u05d1')],

  [h('\\u05e0\\u05d4\\u05e8\\u05d9\\u05d4'), h('\\u05e0\\u05d4\\u05e8\\u05d9\\u05d4')],
  [h('\\u05d0\\u05db\\u05d6\\u05d9\\u05d1'), h('\\u05e0\\u05d4\\u05e8\\u05d9\\u05d4')],

  [h('\\u05d0\\u05d5\\u05e8 \\u05e2\\u05e7\\u05d9\\u05d1\\u05d0'), h('\\u05d0\\u05d5\\u05e8 \\u05e2\\u05e7\\u05d9\\u05d1\\u05d0')],
  [h('\\u05d0\\u05d5\\u05e8 \\u05d9\\u05dd'), h('\\u05d0\\u05d5\\u05e8 \\u05e2\\u05e7\\u05d9\\u05d1\\u05d0')],

  [h('\\u05e8\\u05e2\\u05e0\\u05e0\\u05d4'), h('\\u05e8\\u05e2\\u05e0\\u05e0\\u05d4')],
  [h('\\u05e9\\u05db\\u05d5\\u05e0\\u05ea \\u05d4\\u05e7\\u05d0\\u05e0\\u05d8\\u05e8\\u05d9'), h('\\u05e8\\u05e2\\u05e0\\u05e0\\u05d4')],

  [h('\\u05e8\\u05de\\u05dc\\u05d4'), h('\\u05e8\\u05de\\u05dc\\u05d4')],
  [h('\\u05d9\\u05d4\\u05d5\\u05d3-\\u05de\\u05d5\\u05e0\\u05d5\\u05e1\\u05d5\\u05df'), h('\\u05d9\\u05d4\\u05d5\\u05d3-\\u05de\\u05d5\\u05e0\\u05d5\\u05e1\\u05d5\\u05df')],
  [h('\\u05d9\\u05d4\\u05d5\\u05d3 \\u05de\\u05d5\\u05e0\\u05d5\\u05e1\\u05d5\\u05df'), h('\\u05d9\\u05d4\\u05d5\\u05d3-\\u05de\\u05d5\\u05e0\\u05d5\\u05e1\\u05d5\\u05df')],
  ['river-side', h('\\u05d9\\u05d4\\u05d5\\u05d3-\\u05de\\u05d5\\u05e0\\u05d5\\u05e1\\u05d5\\u05df')],
];

function normalizeBaseUrl(input) {
  const url = new URL(input.startsWith('http') ? input : `https://${input}`);
  return url.origin;
}

async function tavilySearch(apiKey, query, maxResults = 10) {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'advanced',
      max_results: maxResults,
      include_answer: false,
      include_raw_content: false,
    }),
  });
  if (!response.ok) return [];
  const data = await response.json();
  return data.results || [];
}

async function tavilyExtract(apiKey, urls) {
  if (!urls.length) return [];
  const response = await fetch('https://api.tavily.com/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      urls,
      extract_depth: 'advanced',
      include_images: false,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Tavily extract failed: ${response.status} ${text}`);
  }
  const data = await response.json();
  return data.results || [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function canonicalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    url.search = '';
    return url.toString().toLowerCase();
  } catch {
    return value.split('#')[0].split('?')[0].toLowerCase();
  }
}

function extractProjectUrlsFromText(baseUrl, text) {
  const escaped = baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${escaped}/portfolio-item/[^\\s)"']+`, 'g');
  return unique([...text.matchAll(pattern)].map(match => canonicalizeUrl(match[0].replace(/[.,]+$/, ''))));
}

function extractHeadings(markdown) {
  return [...markdown.matchAll(/^#{1,3}\s+(.+)$/gm)]
    .map(match => match[1].trim())
    .filter(Boolean);
}

function isNotFound(headings) {
  const notFound = h('\\u05d4\\u05e2\\u05de\\u05d5\\u05d3 \\u05dc\\u05d0 \\u05e0\\u05de\\u05e6\\u05d0');
  return headings.some(heading => heading.includes(notFound));
}

function detectCitiesFromHighConfidenceText(text) {
  const haystack = text.toLowerCase();
  const cities = [];
  for (const [needle, city] of CITY_ALIASES) {
    if (haystack.includes(String(needle).toLowerCase())) cities.push(city);
  }
  return unique(cities);
}

function firstLikelyCity(cities, title) {
  if (cities.length <= 1) return cities;
  const lowerTitle = title.toLowerCase();
  const titleRanked = cities
    .map(city => ({ city, index: lowerTitle.indexOf(city.toLowerCase()) }))
    .filter(row => row.index >= 0)
    .sort((a, b) => a.index - b.index)
    .map(row => row.city);
  return titleRanked.length ? [titleRanked[0]] : [cities[0]];
}

async function discoverProjectUrls(apiKey, siteUrl) {
  const baseUrl = normalizeBaseUrl(siteUrl);
  const host = new URL(baseUrl).host.replace(/^www\./, '');

  const searchResults = await Promise.all([
    tavilySearch(apiKey, `${host} projects`, 10),
    tavilySearch(apiKey, `${host} portfolio projects`, 10),
    tavilySearch(apiKey, `${host} residential projects cities`, 10),
  ]);

  const seedUrls = unique([
    `${baseUrl}/projects/`,
    `${baseUrl}/portfolio_entries/projects/`,
    ...searchResults.flat().map(result => result.url).filter(url => url && url.startsWith(baseUrl)).map(canonicalizeUrl),
  ]);

  const indexPages = await tavilyExtract(apiKey, seedUrls);
  const indexText = indexPages.map(page => page.raw_content || page.content || '').join('\n');
  return unique(extractProjectUrlsFromText(baseUrl, indexText));
}

async function main() {
  const siteUrl = process.argv[2] || DEFAULT_SITE;
  const env = loadEnv();
  const apiKey = env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error('Missing TAVILY_API_KEY. Set it in the environment or .env.local.');
  }

  const projectUrls = await discoverProjectUrls(apiKey, siteUrl);
  const pages = [];
  for (let index = 0; index < projectUrls.length; index += 8) {
    pages.push(...await tavilyExtract(apiKey, projectUrls.slice(index, index + 8)));
  }

  const projects = pages
    .map(page => {
      const content = page.raw_content || page.content || '';
      const headings = extractHeadings(content);
      if (isNotFound(headings)) return null;

      const title = headings[0] || '';
      const highConfidenceText = `${decodeURIComponent(page.url)}\n${headings.slice(0, 4).join('\n')}`;
      const cities = firstLikelyCity(detectCitiesFromHighConfidenceText(highConfidenceText), title);

      return {
        url: page.url,
        title,
        cities,
      };
    })
    .filter(Boolean);

  const cities = unique(projects.flatMap(project => project.cities)).sort((a, b) => a.localeCompare(b, 'he'));

  console.log(JSON.stringify({
    siteUrl,
    projectUrlsFound: projectUrls.length,
    projectPagesExtracted: projects.length,
    cities,
    projects,
  }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
