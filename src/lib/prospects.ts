/**
 * Prospect discovery and email finding.
 * Primary: Apify Google Maps Scraper (with token rotation).
 * Fallback: Free web scraping (YellowPages + DuckDuckGo) when tokens exhausted.
 */

import { promises as dns } from "dns";
import { USER_AGENT } from "@/lib/constants";

// --- Types ---

export interface DiscoveredBusiness {
  businessName: string;
  businessUrl: string;
  phone: string | null;
  rating: number | null;
  reviewCount: number | null;
  address: string | null;
}

interface ApifyRunResponse {
  data: {
    id: string;
    status: string;
    defaultDatasetId: string;
  };
}

interface ApifyDatasetItem {
  title?: string;
  website?: string;
  phone?: string;
  totalScore?: number;
  reviewsCount?: number;
  address?: string;
  street?: string;
  city?: string;
  state?: string;
  url?: string;
}

// --- Apify Google Maps Scraper ---

const APIFY_ACTOR_ID = "nwua9Gu5YrADL7ZDj";
const APIFY_BASE_URL = "https://api.apify.com/v2";

// --- Token Management (state machine with monthly reset) ---

const APIFY_TOKEN_POOL: string[] =
  process.env.APIFY_TOKENS?.split(",").map((t) => t.trim()).filter(Boolean) ?? [];

const exhaustedTokens = new Map<string, number>();

function currentMonth(): number {
  const d = new Date();
  return d.getFullYear() * 12 + d.getMonth();
}

function markExhausted(token: string): void {
  exhaustedTokens.set(token, currentMonth());
}

function isExhausted(token: string): boolean {
  const month = exhaustedTokens.get(token);
  if (!month) return false;
  if (month < currentMonth()) {
    exhaustedTokens.delete(token);
    return false;
  }
  return true;
}

function getAvailableTokens(): string[] {
  if (APIFY_TOKEN_POOL.length === 0) {
    const token = process.env.APIFY_TOKEN;
    return token ? [token] : [];
  }
  return APIFY_TOKEN_POOL.filter((t) => !isExhausted(t));
}

function getApifyToken(): string {
  const available = getAvailableTokens();
  if (available.length === 0) {
    const total = APIFY_TOKEN_POOL.length || 1;
    throw new Error(
      `All ${total} Apify tokens are exhausted this month. Tokens reset on the 1st.`
    );
  }
  return available[Math.floor(Math.random() * available.length)];
}

// --- Discovery: Main Entry Point ---

/**
 * Discover businesses in a city.
 * Tries Apify first, falls back to free scraping if all tokens exhausted.
 */
export async function discoverBusinesses(
  city: string,
  vertical: string = "med spa",
  limit: number = 20
): Promise<DiscoveredBusiness[]> {
  try {
    return await discoverBusinessesApify(city, vertical, limit);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("tokens") && msg.includes("exhausted")) {
      console.warn(`[discovery] ${msg}`);
      return await discoverBusinessesFree(city, vertical, limit);
    }
    throw error;
  }
}

// --- Discovery: Apify ---

async function discoverBusinessesApify(
  city: string,
  vertical: string,
  limit: number
): Promise<DiscoveredBusiness[]> {
  const searchQuery = `${vertical} in ${city}`;
  const maxRetries = Math.min(getAvailableTokens().length, 10);

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const token = getApifyToken();

    const runRes = await fetch(
      `${APIFY_BASE_URL}/acts/${APIFY_ACTOR_ID}/runs?token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchStringsArray: [searchQuery],
          maxCrawledPlacesPerSearch: limit,
        }),
      }
    );

    if (!runRes.ok) {
      const text = await runRes.text();
      if (runRes.status === 401 || runRes.status === 403) {
        markExhausted(token);
        console.warn(
          `Apify token exhausted (${runRes.status}), ${getAvailableTokens().length} tokens remaining. Retrying...`
        );
        continue;
      }
      throw new Error(`Apify run start failed (${runRes.status}): ${text}`);
    }

    const runData: ApifyRunResponse = await runRes.json();
    const runId = runData.data.id;
    const datasetId = runData.data.defaultDatasetId;

    await pollRunCompletion(runId, token);

    const itemsRes = await fetch(
      `${APIFY_BASE_URL}/datasets/${datasetId}/items?token=${token}`
    );

    if (!itemsRes.ok) {
      const text = await itemsRes.text();
      throw new Error(`Apify dataset fetch failed (${itemsRes.status}): ${text}`);
    }

    const items: ApifyDatasetItem[] = await itemsRes.json();

    return items
      .filter((item) => item.title)
      .map((item) => ({
        businessName: item.title!,
        businessUrl: item.website || item.url || "",
        phone: item.phone || null,
        rating: item.totalScore ?? null,
        reviewCount: item.reviewsCount ?? null,
        address: item.address || null,
      }));
  }

  throw new Error(
    `All Apify tokens exhausted after ${maxRetries} attempts. ${exhaustedTokens.size} tokens hit their monthly limit. Tokens reset on the 1st.`
  );
}

async function pollRunCompletion(
  runId: string,
  token: string,
  maxWaitMs: number = 300_000
): Promise<void> {
  const startTime = Date.now();
  const pollIntervalMs = 5_000;

  while (Date.now() - startTime < maxWaitMs) {
    const res = await fetch(
      `${APIFY_BASE_URL}/actor-runs/${runId}?token=${token}`
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Apify run poll failed (${res.status}): ${text}`);
    }

    const data: ApifyRunResponse = await res.json();
    const status = data.data.status;

    if (status === "SUCCEEDED") return;
    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      throw new Error(`Apify run ended with status: ${status}`);
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  throw new Error(`Apify run timed out after ${maxWaitMs}ms`);
}

// --- Discovery: Free Fallback (YellowPages + DuckDuckGo) ---

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const SKIP_DOMAINS = new Set([
  "yelp.com", "yellowpages.com", "facebook.com", "instagram.com",
  "twitter.com", "x.com", "linkedin.com", "tripadvisor.com",
  "bbb.org", "angi.com", "thumbtack.com", "groupon.com",
  "google.com", "youtube.com", "wikipedia.org", "reddit.com",
  "pinterest.com", "nextdoor.com", "mapquest.com", "foursquare.com",
  "manta.com", "superpages.com", "citysearch.com", "tiktok.com",
]);

function shouldSkipUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    for (const d of SKIP_DOMAINS) {
      if (hostname === d || hostname.endsWith(`.${d}`)) return true;
    }
    return false;
  } catch {
    return true;
  }
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Free fallback: scrape YellowPages + DuckDuckGo in parallel,
 * merge and deduplicate results.
 */
async function discoverBusinessesFree(
  city: string,
  vertical: string,
  limit: number
): Promise<DiscoveredBusiness[]> {
  console.log(
    `[discovery:free] Scraping YellowPages + DuckDuckGo for "${vertical} in ${city}"`
  );

  const [ypResult, ddgResult] = await Promise.allSettled([
    scrapeYellowPages(vertical, city),
    scrapeDuckDuckGo(vertical, city),
  ]);

  const results: DiscoveredBusiness[] = [];

  if (ypResult.status === "fulfilled") {
    console.log(`[discovery:free] YellowPages -> ${ypResult.value.length} results`);
    results.push(...ypResult.value);
  } else {
    console.warn(`[discovery:free] YellowPages failed: ${ypResult.reason}`);
  }

  if (ddgResult.status === "fulfilled") {
    console.log(`[discovery:free] DuckDuckGo -> ${ddgResult.value.length} results`);
    results.push(...ddgResult.value);
  } else {
    console.warn(`[discovery:free] DuckDuckGo failed: ${ddgResult.reason}`);
  }

  if (results.length === 0) {
    throw new Error(
      "Free fallback scrapers returned no results. Try again later or wait for Apify token reset on the 1st."
    );
  }

  return deduplicateBusinesses(results).slice(0, limit);
}

/**
 * Scrape YellowPages search results.
 * Returns businesses with name, website URL, phone, and address.
 */
async function scrapeYellowPages(
  vertical: string,
  city: string
): Promise<DiscoveredBusiness[]> {
  const url = `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(vertical)}&geo_location_terms=${encodeURIComponent(city)}`;
  const html = await fetchPage(url);
  if (!html) return [];

  const businesses: DiscoveredBusiness[] = [];

  // Split on result boundaries and parse each block
  const blocks = html.split(/class="[^"]*(?:result|v-card)[^"]*"/).slice(1);

  for (const block of blocks) {
    const nameMatch = block.match(
      /class="business-name"[^>]*>(?:<[^>]*>)*\s*([^<]+)/
    );
    if (!nameMatch) continue;
    const businessName = nameMatch[1].trim();
    if (businessName.length < 3) continue;

    const websiteMatch = block.match(
      /class="track-visit-website"[^>]*href="([^"]+)"/
    );
    const businessUrl = websiteMatch ? websiteMatch[1] : "";

    const phoneMatch = block.match(/class="phones[^"]*"[^>]*>\s*([^<]+)/);
    const phone = phoneMatch ? phoneMatch[1].trim() : null;

    const streetMatch = block.match(/class="street-address"[^>]*>\s*([^<]+)/);
    const localityMatch = block.match(/class="locality"[^>]*>\s*([^<]+)/);
    const address =
      [streetMatch?.[1]?.trim(), localityMatch?.[1]?.trim()]
        .filter(Boolean)
        .join(", ") || null;

    businesses.push({
      businessName,
      businessUrl,
      phone,
      rating: null,
      reviewCount: null,
      address,
    });
  }

  return businesses;
}

/**
 * Scrape DuckDuckGo HTML search for direct business website URLs.
 * Filters out aggregator sites to keep only real business domains.
 */
async function scrapeDuckDuckGo(
  vertical: string,
  city: string
): Promise<DiscoveredBusiness[]> {
  const query = encodeURIComponent(`${vertical} in ${city}`);
  const url = `https://html.duckduckgo.com/html/?q=${query}`;
  const html = await fetchPage(url);
  if (!html) return [];

  const businesses: DiscoveredBusiness[] = [];
  const cityEscaped = city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const resultPattern =
    /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let match;

  while ((match = resultPattern.exec(html)) !== null) {
    let rawUrl = match[1];
    const rawTitle = match[2].replace(/<[^>]*>/g, "").trim();

    // Resolve DuckDuckGo redirect URLs
    const uddgMatch = rawUrl.match(/[?&]uddg=([^&]+)/);
    if (uddgMatch) rawUrl = decodeURIComponent(uddgMatch[1]);

    if (!rawUrl.startsWith("http")) continue;
    if (shouldSkipUrl(rawUrl)) continue;
    if (!rawTitle || rawTitle.length < 3) continue;

    // Clean title to extract business name
    const businessName =
      rawTitle
        .replace(
          /\s*[-|–—]\s*(Home|About Us|About|Contact Us|Contact|Welcome|Official Site|Official Website).*$/i,
          ""
        )
        .replace(
          new RegExp(`\\s*[-|–—]\\s*.*${cityEscaped}.*$`, "i"),
          ""
        )
        .trim() || rawTitle.trim();

    if (businessName.length < 3) continue;

    businesses.push({
      businessName,
      businessUrl: rawUrl,
      phone: null,
      rating: null,
      reviewCount: null,
      address: null,
    });
  }

  return businesses;
}

/**
 * Merge businesses from multiple sources, dedup by normalized name,
 * and prefer entries with more data.
 */
function deduplicateBusinesses(
  businesses: DiscoveredBusiness[]
): DiscoveredBusiness[] {
  const seen = new Map<string, DiscoveredBusiness>();

  for (const biz of businesses) {
    const key = biz.businessName.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (key.length < 3) continue;

    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, { ...biz });
    } else {
      // Merge: fill gaps from the new entry
      if (!existing.businessUrl && biz.businessUrl)
        existing.businessUrl = biz.businessUrl;
      if (!existing.phone && biz.phone) existing.phone = biz.phone;
      if (!existing.address && biz.address) existing.address = biz.address;
      if (existing.rating == null && biz.rating != null)
        existing.rating = biz.rating;
      if (existing.reviewCount == null && biz.reviewCount != null)
        existing.reviewCount = biz.reviewCount;
    }
  }

  return Array.from(seen.values());
}

// --- Email Finding ---

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const FALSE_POSITIVE_PREFIXES = [
  "example",
  "test",
  "noreply",
  "no-reply",
  "donotreply",
  "admin@wordpress",
  "support@wordpress",
  "email@example",
  "your@email",
  "name@domain",
  "user@",
  "someone@",
  "john@",
  "jane@",
  "sentry-",
  "wix@",
];

const FALSE_POSITIVE_DOMAINS = [
  "example.com",
  "domain.com",
  "email.com",
  "sentry.io",
  "wixpress.com",
  "w3.org",
  "schema.org",
  "wordpress.org",
  "wordpress.com",
  "gravatar.com",
  "googleapis.com",
];

function isLikelyRealEmail(email: string): boolean {
  const lower = email.toLowerCase();

  for (const prefix of FALSE_POSITIVE_PREFIXES) {
    if (lower.startsWith(prefix)) return false;
  }

  const domain = lower.split("@")[1];
  if (!domain) return false;

  for (const fp of FALSE_POSITIVE_DOMAINS) {
    if (domain === fp || domain.endsWith(`.${fp}`)) return false;
  }

  if (/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(domain)) return false;

  return true;
}

async function safeFetch(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Find a business email by scraping the website and common contact pages.
 */
export async function findEmailFromWebsite(
  websiteUrl: string
): Promise<string | null> {
  const baseUrl = websiteUrl.startsWith("http")
    ? websiteUrl
    : `https://${websiteUrl}`;

  const base = baseUrl.replace(/\/+$/, "");
  const pagePaths = ["", "/contact", "/contact-us", "/about"];
  const allEmails: string[] = [];

  const pages = await Promise.all(
    pagePaths.map((path) => safeFetch(`${base}${path}`))
  );

  for (const html of pages) {
    if (!html) continue;
    const matches = html.match(EMAIL_REGEX) || [];
    allEmails.push(...matches);
  }

  const uniqueEmails = Array.from(
    new Set(allEmails.map((e) => e.toLowerCase()))
  );
  const validEmails = uniqueEmails.filter(isLikelyRealEmail);

  if (validEmails.length === 0) return null;

  const preferredPrefixes = [
    "info",
    "hello",
    "contact",
    "appointments",
    "book",
    "office",
    "front",
  ];

  const ranked = validEmails.sort((a, b) => {
    const aPrefix = a.split("@")[0];
    const bPrefix = b.split("@")[0];
    const aRank = preferredPrefixes.indexOf(aPrefix);
    const bRank = preferredPrefixes.indexOf(bPrefix);
    if (aRank >= 0 && bRank >= 0) return aRank - bRank;
    if (aRank >= 0) return -1;
    if (bRank >= 0) return 1;
    return a.localeCompare(b);
  });

  return ranked[0];
}

// --- Email Validation ---

/**
 * Validate an email address by checking if the domain has MX records.
 */
export async function validateEmail(email: string): Promise<boolean> {
  const domain = email.split("@")[1];
  if (!domain) return false;

  try {
    const mxRecords = await dns.resolveMx(domain);
    return mxRecords.length > 0;
  } catch {
    return false;
  }
}
