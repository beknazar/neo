import { Pool } from "pg";
import { randomUUID } from "crypto";
import { FULL_QUERY_COUNT } from "@/lib/constants";

let pool: Pool | null = null;

export function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

export async function query(text: string, params?: unknown[]) {
  const client = getPool();
  return client.query(text, params);
}

export async function initDb() {
  await query(`
    ALTER TABLE scan_reports ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE
  `).catch(() => {});

  await query(`
    ALTER TABLE scan_reports ADD COLUMN IF NOT EXISTS query_count INTEGER DEFAULT 25
  `).catch(() => {});

  await query(`
    CREATE TABLE IF NOT EXISTS query_cache (
      cache_key TEXT PRIMARY KEY,
      query TEXT NOT NULL,
      response TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `).catch(() => {});

  await query(`
    CREATE INDEX IF NOT EXISTS idx_query_cache_created_at ON query_cache (created_at)
  `).catch(() => {});

  await initCampaignTables();
}

let _dbInitPromise: Promise<void> | null = null;
export function ensureDb() {
  if (!_dbInitPromise) _dbInitPromise = initDb();
  return _dbInitPromise;
}

export async function saveReport(report: {
  businessName: string;
  businessUrl: string;
  city: string;
  recommendationScore: number;
  shareOfVoice: number;
  totalValidRuns: number;
  totalRuns: number;
  reportData: unknown;
  userId?: string;
  slug?: string;
  queryCount?: number;
}) {
  const result = await query(
    `INSERT INTO scan_reports (business_name, business_url, city, recommendation_score, share_of_voice, total_valid_runs, total_runs, report_data, user_id, slug, query_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      report.businessName,
      report.businessUrl,
      report.city,
      report.recommendationScore,
      report.shareOfVoice,
      report.totalValidRuns,
      report.totalRuns,
      JSON.stringify(report.reportData),
      report.userId || null,
      report.slug || null,
      report.queryCount ?? FULL_QUERY_COUNT,
    ]
  );
  return result.rows[0].id as string;
}

export async function getReport(id: string) {
  const result = await query(
    "SELECT * FROM scan_reports WHERE id = $1",
    [id]
  );
  return result.rows[0] || null;
}

export async function getReportBySlug(slug: string) {
  const result = await query(
    "SELECT * FROM scan_reports WHERE slug = $1",
    [slug]
  );
  return result.rows[0] || null;
}

export function generateSlug(businessName: string, city: string): string {
  const base = `${businessName}-${city}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return base;
}

export async function ensureUniqueSlug(slug: string): Promise<string> {
  const existing = await query(
    "SELECT id FROM scan_reports WHERE slug = $1",
    [slug]
  );
  if (existing.rows.length === 0) return slug;
  // Append short random suffix
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${slug}-${suffix}`;
}

export async function getUserReports(userId: string) {
  const result = await query(
    "SELECT id, slug, business_name, business_url, city, recommendation_score, share_of_voice, query_count, created_at FROM scan_reports WHERE user_id = $1 ORDER BY created_at DESC",
    [userId]
  );
  return result.rows;
}

export async function getTotalUsers() {
  const result = await query('SELECT COUNT(*) as count FROM "user"');
  return parseInt(result.rows[0].count, 10);
}

// --- Prospect Management ---

export interface ProspectRecord {
  businessName: string;
  businessUrl: string;
  city: string;
  phone?: string | null;
  email?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  address?: string | null;
  status?: string;
  scanReportId?: string | null;
}

export async function saveProspect(prospect: ProspectRecord): Promise<string> {
  const result = await query(
    `INSERT INTO prospects (business_name, business_url, city, phone, email, rating, review_count, address, status, scan_report_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (business_url) DO UPDATE SET
       email = COALESCE(EXCLUDED.email, prospects.email),
       rating = COALESCE(EXCLUDED.rating, prospects.rating),
       review_count = COALESCE(EXCLUDED.review_count, prospects.review_count),
       updated_at = NOW()
     RETURNING id`,
    [
      prospect.businessName,
      prospect.businessUrl,
      prospect.city,
      prospect.phone || null,
      prospect.email || null,
      prospect.rating ?? null,
      prospect.reviewCount ?? null,
      prospect.address || null,
      prospect.status || "discovered",
      prospect.scanReportId || null,
    ]
  );
  return result.rows[0].id as string;
}

export async function getProspects(filters?: {
  city?: string;
  status?: string;
}) {
  let sql = "SELECT * FROM prospects WHERE 1=1";
  const params: unknown[] = [];

  if (filters?.city) {
    params.push(filters.city);
    sql += ` AND city = $${params.length}`;
  }
  if (filters?.status) {
    params.push(filters.status);
    sql += ` AND status = $${params.length}`;
  }

  sql += " ORDER BY created_at DESC";

  const result = await query(sql, params);
  return result.rows;
}

export async function updateProspectStatus(
  id: string,
  status: string
): Promise<void> {
  await query(
    "UPDATE prospects SET status = $1, updated_at = NOW() WHERE id = $2",
    [status, id]
  );
}

export async function linkProspectToReport(
  prospectId: string,
  reportId: string
): Promise<void> {
  await query(
    "UPDATE prospects SET scan_report_id = $1, updated_at = NOW() WHERE id = $2",
    [reportId, prospectId]
  );
}

export interface EmailSendRecord {
  prospectId: string;
  templateName: string;
  subject: string;
  body: string;
  status?: string;
  campaignId?: string | null;
  variant?: string | null;
  resendId?: string | null;
  unsubscribeToken?: string | null;
}

export async function saveEmailSend(send: EmailSendRecord): Promise<string> {
  const token = send.unsubscribeToken || randomUUID();
  const result = await query(
    `INSERT INTO email_sends (prospect_id, template_name, subject, body, status, campaign_id, variant, resend_id, unsubscribe_token)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      send.prospectId,
      send.templateName,
      send.subject,
      send.body,
      send.status || "queued",
      send.campaignId || null,
      send.variant || null,
      send.resendId || null,
      token,
    ]
  );
  return result.rows[0].id as string;
}

// --- Campaign Management ---

export async function initCampaignTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      vertical TEXT NOT NULL,
      city TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      subject_a TEXT NOT NULL,
      body_a TEXT NOT NULL,
      subject_b TEXT,
      body_b TEXT,
      target_count INTEGER DEFAULT 10,
      sent_count INTEGER DEFAULT 0,
      open_count INTEGER DEFAULT 0,
      click_count INTEGER DEFAULT 0,
      reply_count INTEGER DEFAULT 0,
      bounce_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `).catch(() => {});

  await query(`
    CREATE TABLE IF NOT EXISTS email_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email_send_id UUID REFERENCES email_sends(id),
      campaign_id UUID,
      event_type TEXT NOT NULL,
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `).catch(() => {});

  // Add columns to email_sends if missing
  for (const col of [
    "campaign_id UUID",
    "variant TEXT",
    "resend_id TEXT",
    "opened_at TIMESTAMP",
    "clicked_at TIMESTAMP",
    "unsubscribe_token TEXT",
  ]) {
    const name = col.split(" ")[0];
    await query(
      `ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS ${name} ${col.split(" ").slice(1).join(" ")}`
    ).catch(() => {});
  }

  // Add unsubscribed_at to prospects
  await query(
    `ALTER TABLE prospects ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMP`
  ).catch(() => {});
}

export interface CampaignRecord {
  name: string;
  vertical: string;
  city: string;
  subjectA: string;
  bodyA: string;
  subjectB?: string;
  bodyB?: string;
  targetCount?: number;
}

export async function createCampaign(c: CampaignRecord): Promise<string> {
  const result = await query(
    `INSERT INTO campaigns (name, vertical, city, subject_a, body_a, subject_b, body_b, target_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [c.name, c.vertical, c.city, c.subjectA, c.bodyA, c.subjectB || null, c.bodyB || null, c.targetCount ?? 10]
  );
  return result.rows[0].id as string;
}

export async function getCampaigns() {
  const result = await query("SELECT * FROM campaigns ORDER BY created_at DESC");
  return result.rows;
}

export async function getCampaign(id: string) {
  const result = await query("SELECT * FROM campaigns WHERE id = $1", [id]);
  return result.rows[0] || null;
}

export async function updateCampaignStatus(id: string, status: string) {
  await query("UPDATE campaigns SET status = $1, updated_at = NOW() WHERE id = $2", [status, id]);
}

export async function incrementCampaignSent(id: string) {
  await query("UPDATE campaigns SET sent_count = sent_count + 1, updated_at = NOW() WHERE id = $1", [id]);
}

export async function getActiveCampaigns() {
  const result = await query(
    "SELECT * FROM campaigns WHERE status = 'active' AND sent_count < target_count ORDER BY created_at ASC"
  );
  return result.rows;
}

export async function getNextProspectsForCampaign(
  campaignId: string,
  vertical: string,
  city: string,
  limit: number
) {
  const result = await query(
    `SELECT p.* FROM prospects p
     WHERE p.city = $1
       AND p.email IS NOT NULL
       AND p.unsubscribed_at IS NULL
       AND p.status != 'emailed'
       AND p.status != 'signed_up'
       AND NOT EXISTS (
         SELECT 1 FROM email_sends es
         WHERE es.prospect_id = p.id AND es.campaign_id = $2
       )
     ORDER BY p.rating DESC NULLS LAST
     LIMIT $3`,
    [city, campaignId, limit]
  );
  return result.rows;
}

// --- Email Event Tracking ---

export async function saveEmailEvent(event: {
  emailSendId?: string;
  campaignId?: string;
  eventType: string;
  metadata?: unknown;
}) {
  await query(
    `INSERT INTO email_events (email_send_id, campaign_id, event_type, metadata)
     VALUES ($1, $2, $3, $4)`,
    [event.emailSendId || null, event.campaignId || null, event.eventType, event.metadata ? JSON.stringify(event.metadata) : null]
  );

  // Update email_sends timestamps
  if (event.emailSendId) {
    if (event.eventType === "email.opened") {
      await query(
        "UPDATE email_sends SET opened_at = COALESCE(opened_at, NOW()) WHERE id = $1",
        [event.emailSendId]
      );
    }
    if (event.eventType === "email.clicked") {
      await query(
        "UPDATE email_sends SET clicked_at = COALESCE(clicked_at, NOW()) WHERE id = $1",
        [event.emailSendId]
      );
    }
  }

  // Update campaign aggregate counters
  if (event.campaignId) {
    const colMap: Record<string, string> = {
      "email.opened": "open_count",
      "email.clicked": "click_count",
      "email.bounced": "bounce_count",
      "email.complained": "bounce_count",
    };
    const col = colMap[event.eventType];
    if (col) {
      await query(
        `UPDATE campaigns SET ${col} = ${col} + 1, updated_at = NOW() WHERE id = $1`,
        [event.campaignId]
      );
    }
  }
}

export async function getEmailSendByResendId(resendId: string) {
  const result = await query(
    "SELECT * FROM email_sends WHERE resend_id = $1",
    [resendId]
  );
  return result.rows[0] || null;
}

export async function getCampaignStats(campaignId: string) {
  const sends = await query(
    `SELECT
       COUNT(*) as total_sent,
       COUNT(opened_at) as total_opened,
       COUNT(clicked_at) as total_clicked,
       variant
     FROM email_sends
     WHERE campaign_id = $1
     GROUP BY variant`,
    [campaignId]
  );
  return sends.rows;
}

// --- Unsubscribe ---

export async function unsubscribeByToken(token: string): Promise<boolean> {
  const send = await query(
    "SELECT prospect_id FROM email_sends WHERE unsubscribe_token = $1",
    [token]
  );
  if (send.rows.length === 0) return false;
  await query(
    "UPDATE prospects SET unsubscribed_at = NOW() WHERE id = $1",
    [send.rows[0].prospect_id]
  );
  return true;
}

export async function isProspectUnsubscribed(prospectId: string): Promise<boolean> {
  const result = await query(
    "SELECT unsubscribed_at FROM prospects WHERE id = $1",
    [prospectId]
  );
  return result.rows[0]?.unsubscribed_at != null;
}
