export const FREE_SLOTS = 30;
export const SCARCITY_MIN = 2;
export const SCARCITY_MAX = 8;
export const FREE_QUERY_COUNT = 10;
export const FREE_RUNS_PER_QUERY = 2;
export const FULL_QUERY_COUNT = 25;
export const FULL_RUNS_PER_QUERY = 3;

export const PROSPECT_STATUS = {
  DISCOVERED: "discovered",
  SCANNED: "scanned",
  EMAILED: "emailed",
  SIGNED_UP: "signed_up",
} as const;

export type ProspectStatus =
  (typeof PROSPECT_STATUS)[keyof typeof PROSPECT_STATUS];

export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

export const ADMIN_EMAILS = new Set([
  "tradingbek@gmail.com",
]);

export const USER_AGENT =
  "Mozilla/5.0 (compatible; NeoBot/1.0)";

export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export const CAMPAIGN_STATUS = {
  DRAFT: "draft",
  ACTIVE: "active",
  PAUSED: "paused",
  COMPLETED: "completed",
} as const;

export type CampaignStatus =
  (typeof CAMPAIGN_STATUS)[keyof typeof CAMPAIGN_STATUS];

export const WARMUP_SCHEDULE: Record<number, number> = {
  1: 5, 2: 5, 3: 5,
  4: 15, 5: 15, 6: 15, 7: 15,
  8: 30, 9: 30, 10: 30, 11: 30, 12: 30, 13: 30, 14: 30,
};
export const WARMUP_DEFAULT_LIMIT = 50;

export const EMAILS_PER_CRON_RUN = 5;
