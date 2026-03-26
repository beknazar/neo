import { cacheKey, getCachedResponse, setCachedResponse } from "@/lib/query-cache";
import { generateSlug } from "@/lib/db";

// ---------------------------------------------------------------------------
// Mock the `query` function exported from @/lib/db so that the cache helpers
// never hit a real database.
// ---------------------------------------------------------------------------
const queryMock = vi.fn();

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...actual,
    query: (...args: unknown[]) => queryMock(...args),
  };
});

beforeEach(() => {
  queryMock.mockReset();
});

// ---------------------------------------------------------------------------
// cacheKey
// ---------------------------------------------------------------------------
describe("cacheKey", () => {
  it("returns the same hash for the same input", () => {
    const a = cacheKey("best dentist in LA");
    const b = cacheKey("best dentist in LA");
    expect(a).toBe(b);
  });

  it("returns different hashes for different inputs", () => {
    const a = cacheKey("best dentist in LA");
    const b = cacheKey("best dentist in NYC");
    expect(a).not.toBe(b);
  });

  it("returns a 32-character hex string", () => {
    const key = cacheKey("anything");
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });
});

// ---------------------------------------------------------------------------
// getCachedResponse
// ---------------------------------------------------------------------------
describe("getCachedResponse", () => {
  it("returns null when there are no rows (cache miss)", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const result = await getCachedResponse("abc123");
    expect(result).toBeNull();
  });

  it("returns the cached response string on a cache hit", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ response: '{"score":42}' }],
    });

    const result = await getCachedResponse("abc123");
    expect(result).toBe('{"score":42}');
  });

  it("returns null and does not throw when the query rejects", async () => {
    queryMock.mockRejectedValueOnce(new Error("connection refused"));

    const result = await getCachedResponse("abc123");
    expect(result).toBeNull();
  });

  it("passes the correct SQL and parameters to query", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await getCachedResponse("mykey");

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain("SELECT response FROM query_cache");
    expect(sql).toContain("cache_key = $1");
    expect(params).toEqual(["mykey"]);
  });
});

// ---------------------------------------------------------------------------
// setCachedResponse
// ---------------------------------------------------------------------------
describe("setCachedResponse", () => {
  it("calls query with an INSERT ... ON CONFLICT upsert", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await setCachedResponse("k1", "best dentist in LA", '{"data":true}');

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain("INSERT INTO query_cache");
    expect(sql).toContain("ON CONFLICT");
    expect(params).toEqual(["k1", "best dentist in LA", '{"data":true}']);
  });

  it("does not throw when the query rejects (error is caught)", async () => {
    queryMock.mockRejectedValueOnce(new Error("disk full"));

    // Should resolve without throwing
    await expect(
      setCachedResponse("k1", "query", "response")
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// generateSlug (from db.ts)
// ---------------------------------------------------------------------------
describe("generateSlug", () => {
  it("lowercases and joins business name and city with hyphens", () => {
    expect(generateSlug("Glow Med Spa", "Los Angeles")).toBe(
      "glow-med-spa-los-angeles"
    );
  });

  it("strips special characters like periods and apostrophes", () => {
    const slug = generateSlug("Dr. Smith's Clinic", "Denver");
    expect(slug).not.toMatch(/[.']/);
    expect(slug).toBe("dr-smith-s-clinic-denver");
  });

  it("truncates the slug to a maximum of 80 characters", () => {
    const longName = "A".repeat(80);
    const slug = generateSlug(longName, "Springfield");
    expect(slug.length).toBeLessThanOrEqual(80);
  });

  it("produces no leading or trailing hyphens", () => {
    const slug = generateSlug("---Edge Case---", "---City---");
    expect(slug).not.toMatch(/^-/);
    expect(slug).not.toMatch(/-$/);
  });

  it("collapses consecutive special characters into a single hyphen", () => {
    const slug = generateSlug("Hello   &  World!!", "New   York");
    expect(slug).not.toContain("--");
  });
});
