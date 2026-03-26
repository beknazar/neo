/**
 * Med spa query templates.
 * Each query is a function that takes a city and returns the prompt string.
 * 25 queries covering high-intent local buyer searches.
 */

type QueryTemplate = (city: string) => string;

export const MED_SPA_QUERIES: QueryTemplate[] = [
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

export function generateQueries(city: string): string[] {
  return MED_SPA_QUERIES.map((template) => template(city));
}
