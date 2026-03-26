export const FREE_SLOTS = 30;

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
  process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

export const USER_AGENT =
  "Mozilla/5.0 (compatible; NeoBot/1.0)";
