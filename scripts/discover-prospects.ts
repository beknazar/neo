/**
 * Discover prospects for a given vertical and cities.
 * Usage: npx tsx scripts/discover-prospects.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { discoverBusinesses, findEmailAdvanced, validateEmailDeep } from "../src/lib/prospects";
import { saveProspect, ensureDb } from "../src/lib/db";

const VERTICAL = "personal injury lawyer";
const CITIES = ["Los Angeles", "New York"];
const LIMIT_PER_CITY = 20;

async function main() {
  await ensureDb();

  for (const city of CITIES) {
    console.log(`\n🔍 Discovering ${VERTICAL}s in ${city}...`);

    let businesses;
    try {
      businesses = await discoverBusinesses(city, VERTICAL, LIMIT_PER_CITY);
    } catch (err) {
      console.error(`  Failed to discover in ${city}:`, err instanceof Error ? err.message : err);
      continue;
    }

    console.log(`  Found ${businesses.length} businesses`);

    let emailsFound = 0;
    for (const biz of businesses) {
      process.stdout.write(`  ${biz.businessName}...`);

      // Find email
      let email: string | null = null;
      try {
        email = await findEmailAdvanced(biz.businessName, biz.businessUrl || "", city);
      } catch {
        // silent
      }

      // Validate if found
      let validation = null;
      if (email) {
        try {
          validation = await validateEmailDeep(email);
          if (!validation.valid) {
            console.log(` ${email} (invalid: ${validation.reason})`);
            email = null; // Don't save invalid emails
          }
        } catch {
          // Keep the email, validation failed
        }
      }

      if (email) {
        emailsFound++;
        console.log(` ${email} ✓`);
      } else {
        console.log(` no email found`);
      }

      // Save to DB
      try {
        await saveProspect({
          businessName: biz.businessName,
          businessUrl: biz.businessUrl || "",
          city,
          phone: biz.phone || null,
          email,
          rating: biz.rating ?? null,
          reviewCount: biz.reviewCount ?? null,
          address: biz.address || null,
          status: "discovered",
          scanReportId: null,
        });
      } catch (err) {
        console.error(`  Failed to save ${biz.businessName}:`, err instanceof Error ? err.message : err);
      }
    }

    console.log(`  📧 Emails found: ${emailsFound}/${businesses.length} (${Math.round(emailsFound / businesses.length * 100)}%)`);
  }

  console.log("\n✅ Done! Go to /admin/prospects to preview and send emails.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
