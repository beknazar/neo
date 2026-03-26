import { Pool } from "pg";

let pool: Pool | null = null;

function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

export async function query(text: string, params?: unknown[]) {
  const client = getPool();
  return client.query(text, params);
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
}) {
  const result = await query(
    `INSERT INTO scan_reports (business_name, business_url, city, recommendation_score, share_of_voice, total_valid_runs, total_runs, report_data, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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

export async function getUserReports(userId: string) {
  const result = await query(
    "SELECT id, business_name, business_url, city, recommendation_score, share_of_voice, created_at FROM scan_reports WHERE user_id = $1 ORDER BY created_at DESC",
    [userId]
  );
  return result.rows;
}

export async function getTotalUsers() {
  const result = await query('SELECT COUNT(*) as count FROM "user"');
  return parseInt(result.rows[0].count, 10);
}
