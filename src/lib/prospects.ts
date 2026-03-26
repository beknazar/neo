/**
 * Prospect discovery and email finding.
 * Uses Apify Google Maps Scraper to find med spas,
 * then scrapes websites to find contact emails.
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

// Track exhausted tokens: token → month when it was exhausted (resets monthly)
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
  // Reset if we're in a new month
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
  const available = APIFY_TOKEN_POOL.filter((t) => !isExhausted(t));
  return available;
}

function getApifyToken(): string {
  const available = getAvailableTokens();
  if (available.length === 0) {
    const total = APIFY_TOKEN_POOL.length || 1;
    const exhausted = exhaustedTokens.size;
    throw new Error(
      `All ${total} Apify tokens are exhausted this month (${exhausted} used). Tokens reset on the 1st.`
    );
  }
  return available[Math.floor(Math.random() * available.length)];
}

/**
 * Discover businesses in a city using Apify Google Maps Scraper.
 * Accepts a vertical (e.g. "dentist", "personal injury lawyer") to customize the search.
 */
export async function discoverBusinesses(
  city: string,
  vertical: string = "med spa",
  limit: number = 20
): Promise<DiscoveredBusiness[]> {
  const searchQuery = `${vertical} in ${city}`;
  const maxRetries = Math.min(getAvailableTokens().length, 10);

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const token = getApifyToken();

    // 1. Start the actor run
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
      // 401 = invalid token, 403 = quota exceeded — mark and retry
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

    // 2. Poll until run completes
    await pollRunCompletion(runId, token);

    // 3. Fetch dataset items
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

/**
 * Poll an Apify actor run until it reaches a terminal state.
 */
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

    // Still running — wait before next poll
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  throw new Error(`Apify run timed out after ${maxWaitMs}ms`);
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

  // Filter out image/file extensions that regex might catch
  if (/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(domain)) return false;

  return true;
}

/**
 * Fetch a URL safely, returning the HTML text or null on failure.
 */
async function safeFetch(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
      },
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
 * Returns the most likely business contact email, or null.
 */
export async function findEmailFromWebsite(
  websiteUrl: string
): Promise<string | null> {
  const baseUrl = websiteUrl.startsWith("http")
    ? websiteUrl
    : `https://${websiteUrl}`;

  // Normalize: remove trailing slash for consistent path joining
  const base = baseUrl.replace(/\/+$/, "");

  const pagePaths = ["", "/contact", "/contact-us", "/about"];
  const allEmails: string[] = [];

  // Fetch all pages in parallel
  const pages = await Promise.all(
    pagePaths.map((path) => safeFetch(`${base}${path}`))
  );

  for (const html of pages) {
    if (!html) continue;
    const matches = html.match(EMAIL_REGEX) || [];
    allEmails.push(...matches);
  }

  // Deduplicate and filter
  const uniqueEmails = Array.from(new Set(allEmails.map((e) => e.toLowerCase())));
  const validEmails = uniqueEmails.filter(isLikelyRealEmail);

  if (validEmails.length === 0) return null;

  // Rank emails: prefer info@, hello@, contact@ over generic ones
  const preferredPrefixes = ["info", "hello", "contact", "appointments", "book", "office", "front"];

  const ranked = validEmails.sort((a, b) => {
    const aPrefix = a.split("@")[0];
    const bPrefix = b.split("@")[0];
    const aRank = preferredPrefixes.indexOf(aPrefix);
    const bRank = preferredPrefixes.indexOf(bPrefix);
    // Preferred prefixes first (found = index >= 0), then alphabetical
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
 * Returns true if MX records exist (email is likely deliverable).
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
