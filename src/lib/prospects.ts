/**
 * Prospect discovery and email finding.
 * Primary: Apify Google Maps Scraper (with token rotation).
 * Fallback: Free web scraping (YellowPages + DuckDuckGo) when tokens exhausted.
 */

import { promises as dns } from "dns";
import net from "net";
import { USER_AGENT, BROWSER_USER_AGENT } from "@/lib/constants";

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

class ApifyTokensExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApifyTokensExhaustedError";
  }
}

// --- Apify Google Maps Scraper ---

const APIFY_ACTOR_ID = "nwua9Gu5YrADL7ZDj";
const APIFY_BASE_URL = "https://api.apify.com/v2";
const APIFY_TERMINAL_FAILURES = new Set(["FAILED", "ABORTED", "TIMED-OUT"]);

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
    throw new ApifyTokensExhaustedError(
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
    if (error instanceof ApifyTokensExhaustedError) {
      console.warn(`[discovery] ${error.message}`);
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

  throw new ApifyTokensExhaustedError(
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
    if (APIFY_TERMINAL_FAILURES.has(status)) {
      throw new Error(`Apify run ended with status: ${status}`);
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  throw new Error(`Apify run timed out after ${maxWaitMs}ms`);
}

// --- Discovery: Free Fallback (YellowPages + DuckDuckGo) ---

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
    let hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (SKIP_DOMAINS.has(hostname)) return true;
    let dot = hostname.indexOf(".");
    while (dot !== -1) {
      hostname = hostname.slice(dot + 1);
      if (SKIP_DOMAINS.has(hostname)) return true;
      dot = hostname.indexOf(".");
    }
    return false;
  } catch {
    return true;
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
  const html = await fetchHtml(url, { browser: true, timeoutMs: 15_000 });
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
  const html = await fetchHtml(url, { browser: true, timeoutMs: 15_000 });
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

// --- Concurrency Limiter ---

/**
 * Simple concurrency limiter for HTTP requests across all email discovery sources.
 * Ensures at most `maxConcurrent` tasks run at once.
 */
class ConcurrencyLimiter {
  private running = 0;
  private queue: (() => void)[] = [];

  constructor(private maxConcurrent: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    while (this.running >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

const emailDiscoveryLimiter = new ConcurrencyLimiter(5);

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
  "duckduckgo.com",
  "google.com",
  "bing.com",
  "yahoo.com",
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

const PREFERRED_EMAIL_PREFIXES = [
  "info", "hello", "contact", "appointments", "book", "office", "front",
];

/** Deduplicate, filter false positives, and rank emails by preferred prefix. */
function pickBestEmail(emails: string[]): string | null {
  const valid = emails.filter(isLikelyRealEmail);
  if (valid.length === 0) return null;

  valid.sort((a, b) => {
    const aRank = PREFERRED_EMAIL_PREFIXES.indexOf(a.split("@")[0]);
    const bRank = PREFERRED_EMAIL_PREFIXES.indexOf(b.split("@")[0]);
    if (aRank >= 0 && bRank >= 0) return aRank - bRank;
    if (aRank >= 0) return -1;
    if (bRank >= 0) return 1;
    return a.localeCompare(b);
  });

  return valid[0];
}

async function fetchHtml(
  url: string,
  opts?: { browser?: boolean; timeoutMs?: number }
): Promise<string | null> {
  try {
    const headers: Record<string, string> = {
      "User-Agent": opts?.browser ? BROWSER_USER_AGENT : USER_AGENT,
    };
    if (opts?.browser) {
      headers.Accept = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
      headers["Accept-Language"] = "en-US,en;q=0.9";
    }
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(opts?.timeoutMs ?? 10_000),
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
    pagePaths.map((path) => fetchHtml(`${base}${path}`))
  );

  for (const html of pages) {
    if (!html) continue;
    const matches = html.match(EMAIL_REGEX) || [];
    allEmails.push(...matches);
  }

  const uniqueEmails = Array.from(
    new Set(allEmails.map((e) => e.toLowerCase()))
  );
  return pickBestEmail(uniqueEmails);
}

// --- Advanced Email Discovery ---

/** Domains that are aggregators, not real business sites — skip for pattern guessing */
const AGGREGATOR_DOMAINS = new Set([
  "yelp.com", "yellowpages.com", "facebook.com", "instagram.com",
  "twitter.com", "x.com", "linkedin.com", "tripadvisor.com",
  "bbb.org", "angi.com", "thumbtack.com", "groupon.com",
  "google.com", "youtube.com", "wikipedia.org", "reddit.com",
  "pinterest.com", "nextdoor.com", "mapquest.com", "foursquare.com",
  "manta.com", "superpages.com", "citysearch.com", "tiktok.com",
  "wix.com", "squarespace.com", "weebly.com", "godaddy.com",
  "wordpress.com", "blogspot.com",
]);

/**
 * Check if a URL belongs to an aggregator / non-business domain.
 * Used by pattern guessing to skip domains that won't have a catch-all mailbox.
 */
function isAggregatorDomain(url: string): boolean {
  try {
    let hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (AGGREGATOR_DOMAINS.has(hostname)) return true;
    let dot = hostname.indexOf(".");
    while (dot !== -1) {
      hostname = hostname.slice(dot + 1);
      if (AGGREGATOR_DOMAINS.has(hostname)) return true;
      dot = hostname.indexOf(".");
    }
    return false;
  } catch {
    return true;
  }
}

/**
 * Extract the registrable domain from a URL (e.g. "https://www.sfmedspa.com/about" -> "sfmedspa.com").
 */
function extractDomain(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return hostname || null;
  } catch {
    return null;
  }
}

/**
 * Source 2: Search DuckDuckGo for emails associated with a business.
 * Searches `"{businessName}" email {city}` and extracts email addresses from result HTML.
 */
async function searchDuckDuckGoForEmail(
  businessName: string,
  city: string,
): Promise<string | null> {
  const query = encodeURIComponent(`"${businessName}" email ${city}`);
  const url = `https://html.duckduckgo.com/html/?q=${query}`;

  const html = await emailDiscoveryLimiter.run(() =>
    fetchHtml(url, { browser: true, timeoutMs: 10_000 })
  );
  if (!html) return null;

  const matches = html.match(EMAIL_REGEX) || [];
  const uniqueEmails = Array.from(new Set(matches.map((e) => e.toLowerCase())));
  return pickBestEmail(uniqueEmails);
}

/**
 * Source 3: Scrape YellowPages search results and individual listing pages for emails.
 */
async function searchYellowPagesForEmail(
  businessName: string,
  city: string,
): Promise<string | null> {
  const searchUrl = `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(businessName)}&geo_location_terms=${encodeURIComponent(city)}`;

  const html = await emailDiscoveryLimiter.run(() =>
    fetchHtml(searchUrl, { browser: true, timeoutMs: 10_000 })
  );
  if (!html) return null;

  const allEmails: string[] = [];

  // Extract emails from the search results page itself
  const pageEmails = html.match(EMAIL_REGEX) || [];
  allEmails.push(...pageEmails);

  // Find individual listing page links and scrape those too
  const listingPattern = /href="(\/[^"]*\?lid=[^"]+)"/g;
  const listingUrls: string[] = [];
  let listingMatch;
  while ((listingMatch = listingPattern.exec(html)) !== null) {
    if (listingUrls.length >= 3) break; // limit to first 3 listings
    listingUrls.push(`https://www.yellowpages.com${listingMatch[1]}`);
  }

  // Scrape listing pages in parallel (through the limiter)
  const listingPages = await Promise.all(
    listingUrls.map((listingUrl) =>
      emailDiscoveryLimiter.run(() =>
        fetchHtml(listingUrl, { browser: true, timeoutMs: 10_000 })
      )
    )
  );

  for (const listingHtml of listingPages) {
    if (!listingHtml) continue;
    const matches = listingHtml.match(EMAIL_REGEX) || [];
    allEmails.push(...matches);
  }

  const uniqueEmails = Array.from(new Set(allEmails.map((e) => e.toLowerCase())));
  return pickBestEmail(uniqueEmails);
}

/**
 * Source 4: Pattern guessing — try common email prefixes at the business domain
 * and validate with a single MX lookup (MX is domain-level, not per-mailbox).
 */
export async function guessEmailByPattern(
  businessUrl: string,
): Promise<string | null> {
  if (!businessUrl) return null;

  const urlWithProtocol = businessUrl.startsWith("http")
    ? businessUrl
    : `https://${businessUrl}`;

  if (isAggregatorDomain(urlWithProtocol)) return null;

  const domain = extractDomain(urlWithProtocol);
  if (!domain) return null;

  // MX is domain-level — one check covers all prefixes
  const hasMx = await emailDiscoveryLimiter.run(() => validateEmail(`check@${domain}`));
  if (!hasMx) return null;

  return `info@${domain}`;
}

/**
 * Advanced email discovery: tries multiple sources in fallback order.
 *
 * 1. Website scrape (existing findEmailFromWebsite)
 * 2. DuckDuckGo email search + YellowPages scrape (in parallel, 10s timeout)
 * 3. Pattern guessing with MX validation
 *
 * Uses a concurrency limiter (max 5 concurrent HTTP requests).
 */
export async function findEmailAdvanced(
  businessName: string,
  businessUrl: string,
  city: string,
): Promise<string | null> {
  // Source 1: Existing website scrape
  if (businessUrl) {
    const websiteEmail = await findEmailFromWebsite(businessUrl);
    if (websiteEmail) return websiteEmail;
  }

  // Sources 2 + 3: DuckDuckGo + YellowPages in parallel with 10s timeout
  const timeoutPromise = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), 10_000)
  );

  // Add 1-second delay before DDG to avoid rate limiting
  const ddgWithDelay = async (): Promise<string | null> => {
    await new Promise((r) => setTimeout(r, 1_000));
    return searchDuckDuckGoForEmail(businessName, city);
  };

  const [ddgResult, ypResult] = await Promise.all([
    Promise.race([ddgWithDelay(), timeoutPromise]),
    Promise.race([searchYellowPagesForEmail(businessName, city), timeoutPromise]),
  ]);

  if (ddgResult) return ddgResult;
  if (ypResult) return ypResult;

  // Source 4: Pattern guessing with MX validation
  if (businessUrl) {
    const guessedEmail = await guessEmailByPattern(businessUrl);
    if (guessedEmail) return guessedEmail;
  }

  return null;
}

// --- Email Validation ---

// Disposable / temporary email domain blocklist
export const DISPOSABLE_EMAIL_DOMAINS = [
  "mailinator.com",
  "guerrillamail.com",
  "tempmail.com",
  "throwaway.email",
  "yopmail.com",
  "10minutemail.com",
  "trashmail.com",
  "fakeinbox.com",
  "sharklasers.com",
  "guerrillamail.info",
  "grr.la",
  "guerrillamail.net",
  "guerrillamail.de",
  "dispostable.com",
  "mailnesia.com",
  "maildrop.cc",
  "temp-mail.org",
  "tempail.com",
  "mohmal.com",
  "getnada.com",
  "emailondeck.com",
  "mintemail.com",
  "harakirimail.com",
  "jetable.org",
  "spamgourmet.com",
  "mytemp.email",
  "thronesmail.com",
  "bugmenot.com",
  "mailcatch.com",
  "inboxalias.com",
  "crazymailing.com",
  "disposableemailaddresses.emailmiser.com",
  "filzmail.com",
  "tempr.email",
  "discard.email",
] as const;

const DISPOSABLE_DOMAIN_SET = new Set<string>(DISPOSABLE_EMAIL_DOMAINS);

/**
 * Check whether an email belongs to a known disposable / temporary email domain.
 */
export function isDisposableEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  return DISPOSABLE_DOMAIN_SET.has(domain);
}

/** Resolve MX records with a timeout. Throws on timeout or DNS failure. */
async function resolveMxWithTimeout(
  domain: string,
  timeoutMs = 3_000,
): Promise<{ exchange: string; priority: number }[]> {
  return Promise.race([
    dns.resolveMx(domain),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("DNS timeout")), timeoutMs)
    ),
  ]);
}

/**
 * Validate an email address by checking if the domain has MX records.
 * Includes a 3-second timeout so the call doesn't hang on unresponsive DNS.
 */
export async function validateEmail(email: string): Promise<boolean> {
  const domain = email.split("@")[1];
  if (!domain) return false;

  try {
    const mxRecords = await resolveMxWithTimeout(domain);
    return mxRecords.length > 0;
  } catch {
    return false;
  }
}

// --- SMTP RCPT TO Verification ---

export interface SmtpVerifyResult {
  valid: boolean;
  reason?: string;
}

/**
 * Verify an email address exists by connecting to the domain's MX server
 * and issuing SMTP RCPT TO. Returns:
 *   {valid: true}                          – mailbox confirmed (250)
 *   {valid: false, reason: "mailbox not found"} – mailbox rejected (550)
 *   {valid: true, reason: "could not verify"}   – timeout / network / other error
 */
export async function verifyEmailSMTP(
  email: string,
): Promise<SmtpVerifyResult> {
  const domain = email.split("@")[1];
  if (!domain) return { valid: false, reason: "mailbox not found" };

  let mxRecords: { exchange: string; priority: number }[];
  try {
    mxRecords = await resolveMxWithTimeout(domain);
    if (mxRecords.length === 0) {
      return { valid: false, reason: "mailbox not found" };
    }
  } catch {
    return { valid: true, reason: "could not verify" };
  }

  // Sort by priority (lower = preferred) and use the first one
  mxRecords.sort((a, b) => a.priority - b.priority);
  const mxHost = mxRecords[0].exchange;

  return new Promise<SmtpVerifyResult>((resolve) => {
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve({ valid: true, reason: "could not verify" });
    }, 5_000);

    let step: "greeting" | "ehlo" | "mailfrom" | "rcptto" | "done" = "greeting";
    let buffer = "";

    const socket = net.createConnection(25, mxHost);

    function finish(result: SmtpVerifyResult) {
      clearTimeout(timeout);
      socket.destroy();
      resolve(result);
    }

    socket.on("data", (data: Buffer) => {
      buffer += data.toString();

      // SMTP responses end with \r\n — process complete lines
      while (buffer.includes("\r\n")) {
        const lineEnd = buffer.indexOf("\r\n");
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 2);

        // Multi-line responses have a dash after the code (e.g. "250-...")
        // Wait for the final line (space after code: "250 ...")
        const code = parseInt(line.slice(0, 3), 10);
        const isFinal = line.charAt(3) !== "-";
        if (!isFinal) continue;

        if (step === "greeting") {
          if (code >= 200 && code < 300) {
            step = "ehlo";
            socket.write("EHLO neorank.co\r\n");
          } else {
            finish({ valid: true, reason: "could not verify" });
          }
        } else if (step === "ehlo") {
          if (code >= 200 && code < 300) {
            step = "mailfrom";
            socket.write("MAIL FROM:<verify@neorank.co>\r\n");
          } else {
            finish({ valid: true, reason: "could not verify" });
          }
        } else if (step === "mailfrom") {
          if (code >= 200 && code < 300) {
            step = "rcptto";
            socket.write(`RCPT TO:<${email}>\r\n`);
          } else {
            finish({ valid: true, reason: "could not verify" });
          }
        } else if (step === "rcptto") {
          step = "done";
          if (code === 250) {
            finish({ valid: true });
          } else if (code === 550 || code === 551 || code === 552 || code === 553) {
            finish({ valid: false, reason: "mailbox not found" });
          } else {
            finish({ valid: true, reason: "could not verify" });
          }
        }
      }
    });

    socket.on("error", () => {
      finish({ valid: true, reason: "could not verify" });
    });
  });
}

// --- Deep Email Validation (chained pipeline) ---

export interface DeepValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Multi-step email validation pipeline:
 *   1. Syntax check
 *   2. Disposable domain check
 *   3. MX record lookup (3s timeout)
 *   4. SMTP RCPT TO verification (only when isGuessed = true)
 */
export async function validateEmailDeep(
  email: string,
  { isGuessed = false }: { isGuessed?: boolean } = {},
): Promise<DeepValidationResult> {
  // 1. Syntax check
  const syntaxOk = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
  if (!syntaxOk) {
    return { valid: false, reason: "invalid syntax" };
  }

  // 2. Disposable domain check
  if (isDisposableEmail(email)) {
    return { valid: false, reason: "disposable email domain" };
  }

  // 3. MX record lookup (with 3s timeout via validateEmail)
  const hasMx = await validateEmail(email);
  if (!hasMx) {
    return { valid: false, reason: "no MX records" };
  }

  // 4. SMTP RCPT TO verification (only for pattern-guessed emails)
  if (isGuessed) {
    return await verifyEmailSMTP(email);
  }

  return { valid: true };
}
