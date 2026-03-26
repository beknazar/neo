/**
 * Extract business name and city from a URL by fetching and parsing the page.
 * Checks: JSON-LD structured data → Open Graph → <title> → meta description
 */

import { USER_AGENT } from "@/lib/constants";

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
        "User-Agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return { businessName: null, city: null, description: null };

    const html = await res.text();
    const result = parseHtml(html);

    // LLM fallback for missing fields
    if (!result.businessName || !result.city) {
      const llmResult = await extractWithLLM(html);
      if (!result.businessName && llmResult.businessName) {
        result.businessName = llmResult.businessName;
      }
      if (!result.city && llmResult.city) {
        result.city = llmResult.city;
      }
    }

    return result;
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

  if (businessName && city && description) return { businessName, city, description };

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

async function extractWithLLM(
  html: string
): Promise<{ businessName: string | null; city: string | null }> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return { businessName: null, city: null };

  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 3000);

  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.PERPLEXITY_MODEL || "sonar-pro",
        messages: [
          {
            role: "system",
            content:
              'Extract the business name and city from this website text. Respond with ONLY valid JSON: {"businessName": "...", "city": "..."}. Use null for fields you cannot determine.',
          },
          { role: "user", content: text },
        ],
        max_tokens: 100,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return { businessName: null, city: null };

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? "";

    // Extract JSON from response (may have markdown wrapping)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { businessName: null, city: null };

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      businessName: parsed.businessName || null,
      city: parsed.city || null,
    };
  } catch {
    return { businessName: null, city: null };
  }
}

function cleanTitle(title: string): string {
  // Remove common suffixes like " | Home", " - Welcome", " – Official Site"
  return title
    .split(/\s*[|–—-]\s*/)[0]
    .replace(/\s*(home|welcome|official|website)\s*/gi, "")
    .trim();
}
