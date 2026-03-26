/**
 * Extract business name and city from a URL by fetching and parsing the page.
 * Checks: JSON-LD structured data → Open Graph → <title> → meta description
 */

export interface ExtractedInfo {
  businessName: string | null;
  city: string | null;
  description: string | null;
}

export async function extractBusinessInfo(url: string): Promise<ExtractedInfo> {
  const fullUrl = url.startsWith("http") ? url : `https://${url}`;

  try {
    const res = await fetch(fullUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; NeoBot/1.0; +https://neo-beksprojects.vercel.app)",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return { businessName: null, city: null, description: null };

    const html = await res.text();
    return parseHtml(html);
  } catch {
    return { businessName: null, city: null, description: null };
  }
}

function parseHtml(html: string): ExtractedInfo {
  let businessName: string | null = null;
  let city: string | null = null;
  let description: string | null = null;

  // 1. Try JSON-LD structured data
  const jsonLdMatches = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  for (const match of jsonLdMatches) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (
          item["@type"] === "LocalBusiness" ||
          item["@type"] === "MedicalBusiness" ||
          item["@type"] === "HealthAndBeautyBusiness" ||
          item["@type"] === "BeautySalon" ||
          item["@type"]?.includes?.("MedicalBusiness")
        ) {
          businessName = item.name || businessName;
          if (item.address) {
            const addr =
              typeof item.address === "string"
                ? item.address
                : item.address.addressLocality;
            if (addr) city = addr;
          }
        }
        // Generic Organization fallback
        if (!businessName && item["@type"] === "Organization") {
          businessName = item.name;
        }
      }
    } catch {
      // Invalid JSON-LD, skip
    }
  }

  // 2. Try Open Graph tags
  if (!businessName) {
    const ogTitle = html.match(
      /<meta\s+(?:property|name)=["']og:title["']\s+content=["']([^"']+)["']/i
    );
    if (ogTitle) businessName = cleanTitle(ogTitle[1]);
  }

  if (!businessName) {
    const ogSiteName = html.match(
      /<meta\s+(?:property|name)=["']og:site_name["']\s+content=["']([^"']+)["']/i
    );
    if (ogSiteName) businessName = cleanTitle(ogSiteName[1]);
  }

  // 3. Try <title>
  if (!businessName) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) businessName = cleanTitle(titleMatch[1]);
  }

  // 4. Try meta description
  const descMatch = html.match(
    /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i
  );
  if (descMatch) description = descMatch[1].trim();

  // 5. Try to extract city from address patterns in the page
  if (!city) {
    // Common patterns: "City, ST" or "City, State"
    const addressPattern =
      /(?:located?\s+in|serving|based\s+in|visit\s+us\s+in)\s+([A-Z][a-zA-Z\s]+),\s*[A-Z]{2}\b/i;
    const addrMatch = html.match(addressPattern);
    if (addrMatch) city = addrMatch[1].trim();
  }

  // 6. Try schema address in any format
  if (!city) {
    const localityMatch = html.match(
      /"addressLocality"\s*:\s*"([^"]+)"/i
    );
    if (localityMatch) city = localityMatch[1].trim();
  }

  return { businessName, city, description };
}

function cleanTitle(title: string): string {
  // Remove common suffixes like " | Home", " - Welcome", " – Official Site"
  return title
    .split(/\s*[|–—-]\s*/)[0]
    .replace(/\s*(home|welcome|official|website)\s*/gi, "")
    .trim();
}
