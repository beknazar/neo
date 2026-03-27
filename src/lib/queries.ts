/**
 * Multi-vertical query templates for AI visibility scanning.
 * Each vertical has 15-25 queries covering high-intent local buyer searches.
 */

type QueryTemplate = (city: string) => string;

// ---------------------------------------------------------------------------
// Med Spa (original 25 queries)
// ---------------------------------------------------------------------------
const MED_SPA_QUERIES: QueryTemplate[] = [
  (city) => `best med spa in ${city}`,
  (city) => `best Botox ${city}`,
  (city) => `lip filler ${city} recommendations`,
  (city) => `coolsculpting ${city}`,
  (city) => `best facial treatment ${city}`,
  (city) => `hydrafacial ${city}`,
  (city) => `best laser hair removal ${city}`,
  (city) => `microneedling ${city}`,
  (city) => `chemical peel ${city} best`,
  (city) => `best dermal fillers ${city}`,
  (city) => `PRP facial ${city}`,
  (city) => `body contouring ${city} best`,
  (city) => `best anti aging treatments ${city}`,
  (city) => `laser skin resurfacing ${city}`,
  (city) => `best med spa for acne scars ${city}`,
  (city) => `IV therapy ${city} med spa`,
  (city) => `best place for Juvederm ${city}`,
  (city) => `top rated med spa ${city}`,
  (city) => `med spa ${city} reviews`,
  (city) => `best skin tightening treatment ${city}`,
  (city) => `who does the best Botox in ${city}`,
  (city) => `affordable med spa ${city}`,
  (city) => `luxury med spa ${city}`,
  (city) => `best med spa for wrinkles ${city}`,
  (city) => `laser treatment recommendations ${city}`,
];

// ---------------------------------------------------------------------------
// Personal Injury Lawyer (15 queries)
// ---------------------------------------------------------------------------
const PERSONAL_INJURY_LAWYER_QUERIES: QueryTemplate[] = [
  (city) => `best personal injury lawyer in ${city}`,
  (city) => `top personal injury attorney ${city}`,
  (city) => `car accident lawyer ${city}`,
  (city) => `slip and fall attorney ${city}`,
  (city) => `motorcycle accident lawyer ${city}`,
  (city) => `truck accident lawyer ${city}`,
  (city) => `wrongful death attorney ${city}`,
  (city) => `medical malpractice lawyer ${city}`,
  (city) => `work injury lawyer ${city}`,
  (city) => `pedestrian accident attorney ${city}`,
  (city) => `personal injury law firm ${city}`,
  (city) => `injury lawyer near me ${city}`,
  (city) => `best accident attorney ${city}`,
  (city) => `who is the best personal injury lawyer in ${city}`,
  (city) => `personal injury lawyer reviews ${city}`,
];

// ---------------------------------------------------------------------------
// Dentist (15 queries)
// ---------------------------------------------------------------------------
const DENTIST_QUERIES: QueryTemplate[] = [
  (city) => `best dentist in ${city}`,
  (city) => `top rated dentist ${city}`,
  (city) => `cosmetic dentist ${city}`,
  (city) => `emergency dentist ${city}`,
  (city) => `teeth whitening ${city}`,
  (city) => `dental implants ${city}`,
  (city) => `invisalign dentist ${city}`,
  (city) => `family dentist ${city}`,
  (city) => `pediatric dentist ${city}`,
  (city) => `dental crown ${city}`,
  (city) => `root canal specialist ${city}`,
  (city) => `dentist near me ${city}`,
  (city) => `affordable dentist ${city}`,
  (city) => `best dental office ${city}`,
  (city) => `sedation dentist ${city}`,
];

// ---------------------------------------------------------------------------
// Real Estate Agent (15 queries)
// ---------------------------------------------------------------------------
const REAL_ESTATE_AGENT_QUERIES: QueryTemplate[] = [
  (city) => `best realtor in ${city}`,
  (city) => `top real estate agent ${city}`,
  (city) => `real estate agent near me ${city}`,
  (city) => `best listing agent ${city}`,
  (city) => `buyer's agent ${city}`,
  (city) => `luxury real estate agent ${city}`,
  (city) => `first time home buyer agent ${city}`,
  (city) => `top selling realtor ${city}`,
  (city) => `real estate broker ${city}`,
  (city) => `best real estate company ${city}`,
  (city) => `residential realtor ${city}`,
  (city) => `condo specialist ${city}`,
  (city) => `who is the best realtor in ${city}`,
  (city) => `real estate agent reviews ${city}`,
  (city) => `homes for sale agent ${city}`,
];

// ---------------------------------------------------------------------------
// Plastic Surgeon (10 queries)
// ---------------------------------------------------------------------------
const PLASTIC_SURGEON_QUERIES: QueryTemplate[] = [
  (city) => `best plastic surgeon in ${city}`,
  (city) => `top cosmetic surgeon ${city}`,
  (city) => `rhinoplasty surgeon ${city}`,
  (city) => `breast augmentation ${city}`,
  (city) => `facelift surgeon ${city}`,
  (city) => `liposuction ${city}`,
  (city) => `tummy tuck surgeon ${city}`,
  (city) => `BBL surgeon ${city}`,
  (city) => `plastic surgery near me ${city}`,
  (city) => `best cosmetic surgery clinic ${city}`,
];

// ---------------------------------------------------------------------------
// Plumber (10 queries)
// ---------------------------------------------------------------------------
const PLUMBER_QUERIES: QueryTemplate[] = [
  (city) => `best plumber in ${city}`,
  (city) => `emergency plumber ${city}`,
  (city) => `plumber near me ${city}`,
  (city) => `24 hour plumber ${city}`,
  (city) => `affordable plumber ${city}`,
  (city) => `drain cleaning ${city}`,
  (city) => `water heater repair ${city}`,
  (city) => `pipe repair plumber ${city}`,
  (city) => `residential plumber ${city}`,
  (city) => `top rated plumber ${city}`,
];

// ---------------------------------------------------------------------------
// Vertical -> query template map
// ---------------------------------------------------------------------------
const VERTICAL_QUERIES: Map<string, QueryTemplate[]> = new Map([
  ["med spa", MED_SPA_QUERIES],
  ["personal injury lawyer", PERSONAL_INJURY_LAWYER_QUERIES],
  ["dentist", DENTIST_QUERIES],
  ["real estate agent", REAL_ESTATE_AGENT_QUERIES],
  ["plastic surgeon", PLASTIC_SURGEON_QUERIES],
  ["plumber", PLUMBER_QUERIES],
]);

/**
 * Build generic fallback queries for an unknown vertical.
 */
function buildFallbackQueries(vertical: string): QueryTemplate[] {
  return [
    (city) => `best ${vertical} in ${city}`,
    (city) => `top ${vertical} ${city}`,
    (city) => `${vertical} near me ${city}`,
    (city) => `best ${vertical} reviews ${city}`,
    (city) => `top rated ${vertical} ${city}`,
    (city) => `affordable ${vertical} ${city}`,
    (city) => `${vertical} ${city} recommendations`,
    (city) => `who is the best ${vertical} in ${city}`,
    (city) => `${vertical} ${city} cost`,
    (city) => `luxury ${vertical} ${city}`,
  ];
}

/**
 * Generate search queries for a given city and vertical.
 * Defaults to "med spa" when no vertical is provided (backward-compatible).
 */
export function generateQueries(
  city: string,
  vertical?: string,
): string[] {
  const key = (vertical ?? "med spa").toLowerCase().trim();
  const templates = VERTICAL_QUERIES.get(key) ?? buildFallbackQueries(key);
  return templates.map((template) => template(city));
}

// ---------------------------------------------------------------------------
// Vertical inference from URL / business name
// ---------------------------------------------------------------------------

interface VerticalKeywordRule {
  keywords: string[];
  vertical: string;
}

const VERTICAL_KEYWORD_RULES: VerticalKeywordRule[] = [
  { keywords: ["law", "attorney", "legal"], vertical: "personal injury lawyer" },
  { keywords: ["dental", "dentist", "orthodont"], vertical: "dentist" },
  { keywords: ["real estate", "realty", "realtor"], vertical: "real estate agent" },
  { keywords: ["med spa", "medspa", "aesthetic", "botox"], vertical: "med spa" },
  { keywords: ["plumb"], vertical: "plumber" },
  { keywords: ["plastic surg", "cosmetic surg"], vertical: "plastic surgeon" },
];

/**
 * Try to guess the vertical from a business URL or name.
 * Returns `null` when no match is found.
 */
export function inferVerticalFromUrl(url: string): string | null {
  const lower = url.toLowerCase();
  for (const rule of VERTICAL_KEYWORD_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return rule.vertical;
    }
  }
  return null;
}

// Re-export the original constant for any direct importers
export { MED_SPA_QUERIES };
