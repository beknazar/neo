import { Pool } from "pg";
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
  // Add slug column if missing
  await query(`
    ALTER TABLE scan_reports ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE
  `).catch(() => {});

  // Add query_count column if missing
  await query(`
    ALTER TABLE scan_reports ADD COLUMN IF NOT EXISTS query_count INTEGER DEFAULT 25
  `).catch(() => {});

  // Create query cache table
  await query(`
    CREATE TABLE IF NOT EXISTS query_cache (
      cache_key TEXT PRIMARY KEY,
      query TEXT NOT NULL,
      response TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `).catch(() => {});

  // Create index for cache cleanup
  await query(`
    CREATE INDEX IF NOT EXISTS idx_query_cache_created_at ON query_cache (created_at)
  `).catch(() => {});
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
}

export async function saveEmailSend(send: EmailSendRecord): Promise<string> {
  const result = await query(
    `INSERT INTO email_sends (prospect_id, template_name, subject, body, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      send.prospectId,
      send.templateName,
      send.subject,
      send.body,
      send.status || "queued",
    ]
  );
  return result.rows[0].id as string;
}
