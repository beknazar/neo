# NeoRank v2: Outreach System Improvements

## Problems Identified

1. **Send Email button doesn't reflect success** — email sends via Resend but popup stays open, prospect status doesn't update in UI
2. **Scores show 0/25** — no AI visibility scan runs for prospects, so email template defaults to zeros
3. **Most businesses missing emails** — website scraping only catches ~30% of business emails
4. **No email validation** — sending to invalid addresses hurts reputation
5. **AI scan timing wrong** — should run on-demand when previewing email, not during discovery
6. **No analytics** — no PostHog or tracking for user behavior
7. **No email send confirmation UI** — user doesn't know if send succeeded

## Fix 1: Email Send UI Sync [CRITICAL]

**Problem:** `handleSendEmail()` calls the API, Resend sends the email, but the modal doesn't close and the prospect list doesn't refresh.

**Root cause:** The send API returns `{ success: true }` but the frontend doesn't close the modal on success.

**Fix in** `src/app/admin/prospects/page.tsx`:
- After successful POST, close modal (`setEmailModal(null)`)
- Show a brief success toast/banner
- Refresh prospect list to show "Sent" badge
- The code already does this — investigate if the issue is the API returning an error silently

**Check:** Does the Resend API key have send permission for `neorank.co` domain? The key `re_gw8zaB2M_...` was noted as "restricted to only send emails" — verify it works with the verified neorank.co domain.

## Fix 2: AI Scan on Email Preview [HIGH]

**Current flow:** Discover → (no scan) → Preview Email → shows 0/25 scores → Send

**New flow:** Discover → Click "Preview Email" → **Run AI scan if no report exists** → Preview Email with real data → Send

**Changes:**
- `src/app/api/prospects/send-email/route.ts` (PUT endpoint): Before generating the email, check if `prospect.scan_report_id` exists. If not, run a quick AI scan (10 queries, cached) and link the report.
- Add `scanAndLinkProspect(prospectId)` function to `src/lib/db.ts` that:
  1. Runs the AI scan via the existing `/api/scan` logic
  2. Saves the report
  3. Links it to the prospect
  4. Returns the report data for the email template
- **Cache**: Use the existing `query_cache` table — if a scan for this business+city was done in the last 30 days, reuse it

**Key files:**
- `src/app/api/prospects/send-email/route.ts` — trigger scan in PUT (preview)
- `src/lib/scanner.ts` or `src/app/api/scan/route.ts` — extract scan logic into reusable function
- `src/lib/db.ts` — add `getReportByBusinessUrl()` for cache lookup

## Fix 3: Better Email Discovery [HIGH]

**Current:** Scrapes homepage + /contact + /contact-us + /about for email regex matches. Misses ~70% of businesses.

**Additional sources to try (in parallel with website scrape):**
1. **Google search scrape** — search `"{business name}" email {city}` on DuckDuckGo, extract emails from snippets
2. **Yelp/YellowPages business pages** — scrape the individual business listing page (not search results) for contact info
3. **Facebook page scrape** — many businesses list email on their Facebook About page
4. **LinkedIn company page** — sometimes has contact email
5. **Hunter.io free tier** — 25 free lookups/month, finds email patterns for domains
6. **Common email pattern guessing** — if we know the domain, try `info@`, `hello@`, `contact@`, `office@` and validate with MX lookup

**Implementation:**
- Add `findEmailAdvanced(businessName, businessUrl, city)` to `src/lib/prospects.ts`
- Run current method + DuckDuckGo email search in parallel
- Fall back to pattern guessing + MX validation if nothing found

## Fix 4: Email Validation [HIGH]

**Before sending any email, validate it's deliverable:**

1. **MX record check** — already exists (`validateEmail()` in prospects.ts)
2. **Disposable email detection** — check against a list of disposable email domains
3. **Syntax validation** — regex already exists
4. **SMTP verification (optional)** — actually connect to the SMTP server and verify the address exists without sending. Free, no API needed.

**Free validation approach (no paid API):**
- MX lookup (already have)
- Check domain is not disposable (maintain a blocklist)
- SMTP RCPT TO verification (connect to MX server, issue RCPT TO command, check response code)

**Add to** `src/lib/prospects.ts`:
- `validateEmailDeep(email: string): Promise<{ valid: boolean; reason?: string }>`
- Run on every discovered email before saving
- Show validation status in the prospect list UI (green checkmark / red X / yellow warning)

## Fix 5: Allow Email Editing in Prospect List [MEDIUM]

**Add an "Edit" button** next to each prospect's email field:
- Click → inline edit mode
- Type new email → validate → save
- Shows validation status

**Changes:** `src/app/admin/prospects/page.tsx` — add inline email edit with validation indicator

## Fix 6: PostHog Analytics [MEDIUM]

**Add PostHog for tracking:**
- Page views
- Button clicks (Discover, Preview Email, Send Email)
- Conversion funnel: Landing → Sign Up → Scan → View Report
- Email open/click events (from Resend webhooks → PostHog)

**Setup:**
- Install `posthog-js`
- Add PostHog provider to layout
- Add `NEXT_PUBLIC_POSTHOG_KEY` env var
- Track key events in admin pages

## Fix 7: Email Send Confirmation [LOW]

**After sending:**
- Close the modal
- Show a green toast: "Email sent to {email}"
- Auto-dismiss after 3 seconds
- Animate the prospect row to show "Sent" status

## Implementation Order

1. **Fix 1** (UI sync) — debug and fix, ~10 min
2. **Fix 4** (email validation) — ~20 min
3. **Fix 3** (better email discovery) — ~30 min
4. **Fix 2** (AI scan on preview) — ~30 min
5. **Fix 5** (inline email edit) — ~15 min
6. **Fix 7** (send confirmation) — ~10 min
7. **Fix 6** (PostHog) — ~15 min

**Total: ~2 hours CC time**

## Environment Variables Needed

- `NEXT_PUBLIC_POSTHOG_KEY` — PostHog project API key
- `NEXT_PUBLIC_POSTHOG_HOST` — PostHog host (default: https://us.i.posthog.com)
