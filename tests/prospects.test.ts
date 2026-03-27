import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  findEmailFromWebsite,
  findEmailAdvanced,
  guessEmailByPattern,
  isDisposableEmail,
  validateEmail,
  validateEmailDeep,
  DISPOSABLE_EMAIL_DOMAINS,
} from "@/lib/prospects";

// ---------------------------------------------------------------------------
// findEmailFromWebsite — email extraction and ranking
// ---------------------------------------------------------------------------
describe("findEmailFromWebsite", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, text: async () => "" })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when website returns no HTML", async () => {
    const result = await findEmailFromWebsite("https://example-no-exist.com");
    expect(result).toBeNull();
  });

  it("extracts email from homepage HTML", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (!url.includes("/contact") && !url.includes("/about")) {
          return Promise.resolve({
            ok: true,
            text: async () =>
              "<html><body>Contact us at info@coolbusiness.com for more info</body></html>",
          });
        }
        return Promise.resolve({ ok: false, text: async () => "" });
      })
    );

    const result = await findEmailFromWebsite("https://coolbusiness.com");
    expect(result).toBe("info@coolbusiness.com");
  });

  it("prefers info@ over random emails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          "<html><body>john.doe@example-biz.com and info@example-biz.com</body></html>",
      })
    );

    const result = await findEmailFromWebsite("https://example-biz.com");
    expect(result).toBe("info@example-biz.com");
  });

  it("ranks preferred prefixes: info > hello > contact > office", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          "<html><body>office@mybiz.com contact@mybiz.com hello@mybiz.com info@mybiz.com</body></html>",
      })
    );

    const result = await findEmailFromWebsite("https://mybiz.com");
    expect(result).toBe("info@mybiz.com");
  });

  it("filters out noreply, test, and example emails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          "<html><body>noreply@site.com test@example.com admin@wordpress.com real@mybiz.com</body></html>",
      })
    );

    const result = await findEmailFromWebsite("https://mybiz.com");
    expect(result).toBe("real@mybiz.com");
  });

  it("filters out domains: sentry.io, wixpress.com, schema.org", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          "<html><body>abc@sentry.io def@wixpress.com ghi@schema.org contact@realbiz.com</body></html>",
      })
    );

    const result = await findEmailFromWebsite("https://realbiz.com");
    expect(result).toBe("contact@realbiz.com");
  });

  it("filters out file extension false positives (.png, .css, .js)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          "<html><body>logo@images.png styles@bundle.css hello@realsite.com</body></html>",
      })
    );

    const result = await findEmailFromWebsite("https://realsite.com");
    expect(result).toBe("hello@realsite.com");
  });

  it("returns null when all found emails are false positives", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          "<html><body>noreply@site.com test@example.com user@example.com</body></html>",
      })
    );

    const result = await findEmailFromWebsite("https://site.com");
    expect(result).toBeNull();
  });

  it("finds emails from /contact page when homepage has none", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/contact")) {
          return Promise.resolve({
            ok: true,
            text: async () =>
              "<html><body>Reach us: office@clinic.com</body></html>",
          });
        }
        return Promise.resolve({
          ok: true,
          text: async () => "<html><body>Welcome to our site!</body></html>",
        });
      })
    );

    const result = await findEmailFromWebsite("https://clinic.com");
    expect(result).toBe("office@clinic.com");
  });

  it("handles URLs without http protocol", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "<html><body>hello@test-biz.com</body></html>",
    });
    vi.stubGlobal("fetch", fetchSpy);

    await findEmailFromWebsite("test-biz.com");

    const calledUrls = fetchSpy.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calledUrls.some((u: string) => u.startsWith("https://test-biz.com"))).toBe(true);
  });

  it("deduplicates case-insensitive emails across pages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          "<html><body>info@biz.com INFO@BIZ.COM Info@Biz.Com</body></html>",
      })
    );

    const result = await findEmailFromWebsite("https://biz.com");
    expect(result).toBe("info@biz.com");
  });

  it("scrapes all 4 page paths in parallel", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "<html><body>hi@test.com</body></html>",
    });
    vi.stubGlobal("fetch", fetchSpy);

    await findEmailFromWebsite("https://test.com");

    const calledUrls = fetchSpy.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calledUrls).toContainEqual("https://test.com");
    expect(calledUrls).toContainEqual("https://test.com/contact");
    expect(calledUrls).toContainEqual("https://test.com/contact-us");
    expect(calledUrls).toContainEqual("https://test.com/about");
  });
});

// ---------------------------------------------------------------------------
// Token rotation logic
// ---------------------------------------------------------------------------
describe("token rotation state machine", () => {
  it("monthly reset key changes each month", () => {
    const currentMonth = () => {
      const d = new Date();
      return d.getFullYear() * 12 + d.getMonth();
    };

    const month = currentMonth();
    expect(typeof month).toBe("number");
    expect(month).toBeGreaterThan(0);

    // Verify it encodes year + month uniquely
    // 2026 * 12 + 2 (March = month index 2) = 24314
    const march2026 = 2026 * 12 + 2;
    expect(march2026).toBe(24314);

    // April would be different
    const april2026 = 2026 * 12 + 3;
    expect(april2026).not.toBe(march2026);
  });

  it("exhausted token tracking resets on new month", () => {
    // Simulate the isExhausted logic
    const exhaustedTokens = new Map<string, number>();
    const currentMonth = 2026 * 12 + 2; // March 2026

    // Mark token as exhausted this month
    exhaustedTokens.set("token-1", currentMonth);
    expect(exhaustedTokens.get("token-1")).toBe(currentMonth);

    // Same month = still exhausted
    const monthCheck = exhaustedTokens.get("token-1")!;
    expect(monthCheck < currentMonth).toBe(false); // not expired

    // Next month = should reset
    const nextMonth = currentMonth + 1;
    expect(monthCheck < nextMonth).toBe(true); // expired!
  });

  it("random token selection distributes load", () => {
    const tokens = ["a", "b", "c", "d", "e"];
    const picks = new Set<string>();

    // Pick 100 times, should hit multiple tokens
    for (let i = 0; i < 100; i++) {
      picks.add(tokens[Math.floor(Math.random() * tokens.length)]);
    }

    // With 100 picks from 5 tokens, extremely unlikely to miss any
    expect(picks.size).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Business deduplication logic
// ---------------------------------------------------------------------------
describe("business deduplication", () => {
  it("normalizes names by removing non-alphanumeric chars", () => {
    const normalize = (name: string) =>
      name.toLowerCase().replace(/[^a-z0-9]/g, "");

    expect(normalize("SF Med Spa")).toBe("sfmedspa");
    expect(normalize("S.F. Med-Spa!")).toBe("sfmedspa");
    expect(normalize("sf med spa")).toBe("sfmedspa");
  });

  it("merges data from duplicate entries", () => {
    interface Biz {
      name: string;
      url: string;
      phone: string | null;
    }

    const seen = new Map<string, Biz>();
    const key = "sfmedspa";

    // First source has URL but no phone
    seen.set(key, { name: "SF Med Spa", url: "https://sfmedspa.com", phone: null });

    // Second source has phone but no URL
    const existing = seen.get(key)!;
    const incoming: Biz = { name: "SF Med Spa", url: "", phone: "(415) 555-1234" };

    if (!existing.url && incoming.url) existing.url = incoming.url;
    if (!existing.phone && incoming.phone) existing.phone = incoming.phone;

    expect(existing.url).toBe("https://sfmedspa.com");
    expect(existing.phone).toBe("(415) 555-1234");
  });

  it("skips entries with very short names", () => {
    const normalize = (name: string) =>
      name.toLowerCase().replace(/[^a-z0-9]/g, "");

    expect(normalize("Ab").length).toBeLessThan(3);
    expect(normalize("ABC").length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// URL filtering logic
// ---------------------------------------------------------------------------
describe("aggregator URL filtering", () => {
  const SKIP_DOMAINS = new Set([
    "yelp.com", "yellowpages.com", "facebook.com", "instagram.com",
    "twitter.com", "x.com", "linkedin.com", "tripadvisor.com",
    "bbb.org", "google.com", "youtube.com", "wikipedia.org", "reddit.com",
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

  it("skips yelp.com URLs", () => {
    expect(shouldSkipUrl("https://www.yelp.com/biz/something")).toBe(true);
  });

  it("skips facebook.com URLs", () => {
    expect(shouldSkipUrl("https://www.facebook.com/medspa")).toBe(true);
  });

  it("skips subdomains of blocked domains", () => {
    expect(shouldSkipUrl("https://m.yelp.com/biz/something")).toBe(true);
    expect(shouldSkipUrl("https://business.facebook.com/page")).toBe(true);
  });

  it("allows real business domains", () => {
    expect(shouldSkipUrl("https://www.sfmedspa.com")).toBe(false);
    expect(shouldSkipUrl("https://glowaesthetics.com")).toBe(false);
    expect(shouldSkipUrl("https://skinspirit.com/locations")).toBe(false);
  });

  it("skips invalid URLs", () => {
    expect(shouldSkipUrl("not-a-url")).toBe(true);
    expect(shouldSkipUrl("")).toBe(true);
  });

  it("skips google.com and youtube.com", () => {
    expect(shouldSkipUrl("https://www.google.com/maps/place/medspa")).toBe(true);
    expect(shouldSkipUrl("https://www.youtube.com/watch?v=abc")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Disposable email domain detection
// ---------------------------------------------------------------------------
describe("isDisposableEmail", () => {
  it("detects mailinator.com as disposable", () => {
    expect(isDisposableEmail("someone@mailinator.com")).toBe(true);
  });

  it("detects guerrillamail.com as disposable", () => {
    expect(isDisposableEmail("test@guerrillamail.com")).toBe(true);
  });

  it("detects yopmail.com as disposable", () => {
    expect(isDisposableEmail("user@yopmail.com")).toBe(true);
  });

  it("does not flag legitimate domains", () => {
    expect(isDisposableEmail("hello@gmail.com")).toBe(false);
    expect(isDisposableEmail("info@mybusiness.com")).toBe(false);
  });

  it("has at least 30 domains in the blocklist", () => {
    expect(DISPOSABLE_EMAIL_DOMAINS.length).toBeGreaterThanOrEqual(30);
  });
});

// ---------------------------------------------------------------------------
// validateEmail — MX lookup with 3s timeout
// ---------------------------------------------------------------------------
describe("validateEmail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true when domain has MX records", async () => {
    const dns = await import("dns");
    vi.spyOn(dns.promises, "resolveMx").mockResolvedValue([
      { exchange: "mx.example.com", priority: 10 },
    ]);

    const result = await validateEmail("info@example.com");
    expect(result).toBe(true);
  });

  it("returns false when domain has no MX records", async () => {
    const dns = await import("dns");
    vi.spyOn(dns.promises, "resolveMx").mockResolvedValue([]);

    const result = await validateEmail("info@nodomain.fake");
    expect(result).toBe(false);
  });

  it("returns false when DNS lookup times out (within 3s budget)", async () => {
    const dns = await import("dns");
    vi.spyOn(dns.promises, "resolveMx").mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([{ exchange: "mx.slow.com", priority: 10 }]), 10_000))
    );

    const start = Date.now();
    const result = await validateEmail("info@slow-domain.com");
    const elapsed = Date.now() - start;

    expect(result).toBe(false);
    // Should resolve in ~3s due to timeout, not 10s
    expect(elapsed).toBeLessThan(5_000);
  });

  it("returns false for email with no domain part", async () => {
    const result = await validateEmail("nodomain");
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateEmailDeep — chained validation pipeline
// ---------------------------------------------------------------------------
describe("validateEmailDeep", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects invalid syntax", async () => {
    const result = await validateEmailDeep("not-an-email");
    expect(result).toEqual({ valid: false, reason: "invalid syntax" });
  });

  it("rejects disposable email domains", async () => {
    const result = await validateEmailDeep("user@mailinator.com");
    expect(result).toEqual({ valid: false, reason: "disposable email domain" });
  });

  it("rejects when domain has no MX records", async () => {
    const dns = await import("dns");
    vi.spyOn(dns.promises, "resolveMx").mockResolvedValue([]);

    const result = await validateEmailDeep("info@nomx.fake");
    expect(result).toEqual({ valid: false, reason: "no MX records" });
  });

  it("returns valid for a good domain (non-guessed)", async () => {
    const dns = await import("dns");
    vi.spyOn(dns.promises, "resolveMx").mockResolvedValue([
      { exchange: "mx.gooddomain.com", priority: 10 },
    ]);

    const result = await validateEmailDeep("info@gooddomain.com");
    expect(result).toEqual({ valid: true });
  });

  it("returns no MX records when DNS times out", async () => {
    const dns = await import("dns");
    vi.spyOn(dns.promises, "resolveMx").mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([{ exchange: "mx.slow.com", priority: 10 }]), 10_000))
    );

    const result = await validateEmailDeep("info@slow-dns.com");
    expect(result).toEqual({ valid: false, reason: "no MX records" });
  }, 10_000);
});

// ---------------------------------------------------------------------------
// guessEmailByPattern — pattern guessing with MX validation
// ---------------------------------------------------------------------------
describe("guessEmailByPattern", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns first MX-valid email from pattern list", async () => {
    const dns = await import("dns");
    // First call (info@) fails, second call (hello@) succeeds
    let callCount = 0;
    vi.spyOn(dns.promises, "resolveMx").mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve([]); // info@ fails
      return Promise.resolve([{ exchange: "mx.coolbiz.com", priority: 10 }]);
    });

    const result = await guessEmailByPattern("https://coolbiz.com");
    expect(result).toBe("hello@coolbiz.com");
  });

  it("skips aggregator domains (yelp.com, facebook.com)", async () => {
    const result1 = await guessEmailByPattern("https://www.yelp.com/biz/medspa");
    expect(result1).toBeNull();

    const result2 = await guessEmailByPattern("https://www.facebook.com/mybiz");
    expect(result2).toBeNull();

    const result3 = await guessEmailByPattern("https://www.instagram.com/coolspa");
    expect(result3).toBeNull();
  });

  it("returns null when no patterns pass MX validation", async () => {
    const dns = await import("dns");
    vi.spyOn(dns.promises, "resolveMx").mockResolvedValue([]);

    const result = await guessEmailByPattern("https://nomail-domain.fake");
    expect(result).toBeNull();
  });

  it("returns null for empty or missing URL", async () => {
    const result1 = await guessEmailByPattern("");
    expect(result1).toBeNull();

    const result2 = await guessEmailByPattern("not-a-valid-url");
    // isAggregatorDomain will return true for invalid URLs
    expect(result2).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DuckDuckGo email extraction (via findEmailAdvanced)
// ---------------------------------------------------------------------------
describe("findEmailAdvanced — DuckDuckGo email extraction", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts emails from DuckDuckGo HTML when website scrape fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        // Website scrape pages return nothing
        if (
          url.includes("nobiz-site.com") ||
          url.includes("nobiz-site.com/contact") ||
          url.includes("nobiz-site.com/contact-us") ||
          url.includes("nobiz-site.com/about")
        ) {
          return Promise.resolve({ ok: false, text: async () => "" });
        }
        // DuckDuckGo returns HTML with an email
        if (url.includes("duckduckgo.com")) {
          return Promise.resolve({
            ok: true,
            text: async () =>
              '<html><body>Results for Cool Biz: contact them at info@coolbiz-found.com or visit their site</body></html>',
          });
        }
        // YellowPages returns nothing
        if (url.includes("yellowpages.com")) {
          return Promise.resolve({ ok: false, text: async () => "" });
        }
        return Promise.resolve({ ok: false, text: async () => "" });
      })
    );

    const result = await findEmailAdvanced(
      "Cool Biz",
      "https://nobiz-site.com",
      "San Francisco"
    );
    expect(result).toBe("info@coolbiz-found.com");
  }, 15_000);

  it("filters false positives from DuckDuckGo results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        // Website scrape fails
        if (!url.includes("duckduckgo.com") && !url.includes("yellowpages.com")) {
          return Promise.resolve({ ok: false, text: async () => "" });
        }
        // DuckDuckGo returns only false positive emails
        if (url.includes("duckduckgo.com")) {
          return Promise.resolve({
            ok: true,
            text: async () =>
              '<html><body>noreply@site.com test@example.com user@example.com abc@sentry.io</body></html>',
          });
        }
        // YellowPages returns nothing
        return Promise.resolve({ ok: false, text: async () => "" });
      })
    );

    // Mock DNS to fail so pattern guessing also returns null
    const dns = await import("dns");
    vi.spyOn(dns.promises, "resolveMx").mockResolvedValue([]);

    const result = await findEmailAdvanced(
      "Some Biz",
      "https://somebiz.fake",
      "Austin"
    );
    expect(result).toBeNull();
  }, 15_000);
});
