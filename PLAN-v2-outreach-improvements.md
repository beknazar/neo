<!-- /autoplan restore point: /Users/abdik/.gstack/projects/beknazar-neo/main-autoplan-restore-20260327-094112.md -->
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

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Principle | Rationale | Rejected |
|---|-------|----------|-----------|-----------|----------|
| 1 | CEO | Mode: SELECTIVE EXPANSION | P1+P2 | Blast-radius completeness; don't expand beyond outreach files | SCOPE EXPANSION (too ambitious pre-validation) |
| 2 | CEO | Approach B (modified) over A or C | P1+P3 | Fix broken + improve discovery; skip premature analytics/SMTP | Approach C (full plan — too much pre-validation work) |
| 3 | CEO | DEFER Fix 2 (AI scan on preview) | P3 | Emails work without scans; optimize after validation | Add scan-on-preview now |
| 4 | CEO | PARTIAL Fix 4 (MX + disposable, skip SMTP) | P5 | MX is explicit and reliable; SMTP RCPT TO is brittle across providers | Full SMTP verification |
| 5 | CEO | DEFER Fix 6 (PostHog) | P3 | Resend webhooks already track opens/clicks; PostHog adds no signal at <200 emails | Install PostHog now |
| 6 | CEO | ACCEPT Fix 5 (inline email edit) | P1 | Small, in blast radius, useful for correcting bad scraped emails | Defer to later |
| 7 | CEO | ACCEPT Fix 7 (toast) | P1 | Table-stakes UX, trivial to add | Skip |
| 8 | CEO | Fix 1 root cause is API, not frontend | P5 | Code shows setEmailModal(null) already exists at line 233; bug is likely Resend API error | Frontend state management rewrite |
| 9 | CEO | PREMISE GATE: User chose full original plan | USER | User overrode reduced scope recommendation; all 7 fixes stay in scope | Reduced scope (A), Add Fix 2 (B), Minimal (D) |
| 10 | Design | Toast library: use Sonner | P5 | No toast library exists; Sonner is shadcn/ui standard | Build custom, use radix toast |
| 11 | Design | Fix 2 scan loading: skeleton modal + progress message | P5 | 30-60s wait needs explicit UX; user will think it's broken otherwise | Bare spinner |
| 12 | Design | Fix 4 validation indicator: 3-state dot (green/yellow/red) with tooltip | P5 | "Yellow warning" was undefined; now explicit | Leave ambiguous |
| 13 | Design | Fix 5 inline edit: click-to-edit, Enter saves, Escape reverts | P5 | No keyboard/cancel behavior was specified | Popover edit |
| 14 | Design | Fix 7 toast position: bottom-right, 4s duration, max 3 stack | P1 | Complete specification prevents inconsistent implementation | Top-right, 3s |
| 15 | Design | Fix 1 success: 800ms checkmark in modal → close → toast | P5 | Explicit animation sequence prevents jarring UX | Instant close |
| 16 | Design | Prospect row layout: 2-line with email+validation grouped | P1 | 10+ data points per row needs structured layout | Single line (too dense) |
| 17 | Design | Fix 3 email source: no UI for source/confidence in v1 | P3 | Pragmatic — admin just needs the email, not where it came from | Show source badge |
| 18 | Design | Validation timing: async during discovery, re-run on edit | P1 | Complete validation coverage | Only validate on send |
| 19 | Design | PostHog events: use snake_case convention (prospect_discovered, email_sent, email_opened) | P5 | Explicit naming prevents unusable funnels | Ad-hoc naming |
| 20 | Eng | Extract getProspectWithReport() shared helper | P4 | PUT+POST endpoints duplicate prospect lookup + report parsing | Keep duplication |
| 21 | Eng | Wrap saveEmailSend in try-catch that logs but returns success | P5 | Email sent but not recorded = data loss, but user shouldn't see error | Fail the whole request |
| 22 | Eng | Add concurrency limiter (5) for parallel scraping in Fix 3 | P3 | 20 businesses × 4 sources = 80 parallel requests | Unlimited parallelism |
| 23 | Eng | Prevent double-scan: mutex per prospect in Fix 2 | P3 | Double-click on Preview triggers two scans | No protection |
| 24 | Eng | Sonner toast: install + add Toaster to layout | P5 | No toast library exists; needed for Fix 7 | Build custom |
| 25 | Eng | Add CAN-SPAM physical address to email template | P1 | Legal requirement for cold outreach; currently missing | Ignore compliance |
| 26 | Gate | KEEP all scraping sources (Yelp/FB/LinkedIn/DDG/pattern) | USER | User override — wants maximum email discovery coverage | Drop ToS-risky sources |
| 27 | Gate | DEFER separate outreach domain to full automation phase | USER | User chooses to defer until outreach is fully automated | Set up now |
| 28 | Gate | APPROVED — plan with all 25 auto-decisions + 2 user overrides | USER | Full plan approved with user taste decisions applied | Revise or reject |
| 29 | Eng-sub | CRITICAL: Manual send missing resend_id + unsubscribe footer | P1 | POST send-email never captures Resend message ID and never appends unsubscribe footer — CAN-SPAM violation NOW | N/A — must fix |
| 30 | Eng-sub | CRITICAL: Warmup schedule has no daily cap enforcement | P1 | Cron runs 96x/day; day-1 limit of 5 could send 480 emails instead | N/A — must fix |
| 31 | Eng-sub | HIGH: Cron auth is fail-open when env var missing | P1 | Missing CRON_SECRET = unauthenticated email trigger | N/A — must fix |
| 32 | Eng-sub | HIGH: Unsubscribe triggers on GET (link prefetch) | P1 | Outlook SafeLinks/Google scanner will auto-unsubscribe recipients | N/A — must fix |
| 33 | Eng-sub | HIGH: Fix 2 needs maxDuration on send-email route | P5 | 60s scan will hit Vercel function timeout without explicit maxDuration | Ignore timeout |
| 34 | Eng-sub | HIGH: Pattern guessing needs SMTP or manual confirmation | P1 | MX validates domain, not mailbox — hard bounces will tank reputation | Drop SMTP (reverted — keep for guessed emails) |
| 35 | Eng-sub | HIGH: previewLoading is global, not per-prospect | P5 | One loading preview disables all Preview buttons | Keep global |

---

## CEO REVIEW (Phase 1) — /autoplan

### Premise Challenge

**Stated premises (from design doc):**
1. AI search visibility is a growing concern for local businesses — ACCEPTED
2. Free scan is the wedge, not the product — ACCEPTED
3. Validate demand BEFORE building more features — **TENSION: this plan builds more features**
4. Cold outreach with free reports is a viable acquisition channel — **UNVALIDATED**
5. Testing multiple verticals simultaneously is more efficient — ACCEPTED with caveat (see subagent Finding 3)
6. Highest reply rate = vertical to double down on — ACCEPTED

**The critical tension:** Premise 3 says "validate before building." This plan is building before validating. The design doc's Assignment was to send 40 emails manually — this plan instead proposes 7 engineering fixes before sending anything.

### Existing Code Leverage

| Sub-problem | Existing code | Status |
|---|---|---|
| Modal close on send | `setEmailModal(null)` at page.tsx:233 | **Already implemented — investigate API errors** |
| Email validation (MX) | `validateEmail()` in prospects.ts | Extend with disposable blocklist |
| Email discovery | `findEmailFromWebsite()` 4-page scrape | Extend with pattern guessing |
| Campaign system | Full A/B + warmup + cron | Already built and functional |
| Event tracking | Resend webhooks → email_events table | Already tracks opens/clicks |

### Dream State

```
CURRENT STATE                  THIS PLAN                  12-MONTH IDEAL
────────────────────           ────────────────            ────────────────────
Working outreach system.       Polish outreach +           Validated vertical with
30% email hit rate.            better discovery +          paying customers, automated
No customer validation.        validation.                 pipeline, data moat.
Design doc says "test          Still no customer           Revenue-generating SaaS
demand first."                 validation.                 with proven CAC < LTV.
```

### Implementation Alternatives

| | Approach A: Fix & Send | Approach B: Fix + Discover + Send | Approach C: Full Plan |
|---|---|---|---|
| **Summary** | Fix 1 + Fix 7, then send 40 emails | Fix 1 + Fix 3 + Fix 4 (partial) + Fix 5 + Fix 7 | All 7 fixes |
| **Effort** | S (30 min CC) | M (1 hour CC) | L (2 hours CC) |
| **Risk** | Low | Medium | Medium-high (yak-shaving) |
| **Completeness** | 5/10 | 8/10 | 10/10 but premature |

**Auto-decided: Approach B (SELECTIVE EXPANSION)** — P1 completeness within blast radius, P3 pragmatic about premature analytics.

### CLAUDE SUBAGENT (CEO — strategic independence) [subagent-only]

7 findings from independent review:

1. **CRITICAL: Optimizing plumbing while house has no occupants.** Plan is engineering polish when zero demand is validated. Design doc Assignment says send 40 emails now, bugs and all.

2. **CRITICAL: "Cold email with free reports" is unvalidated premise.** Email template reads like generic SEO spam. Suggests testing 3 radically different approaches: cold email (control), personalized Loom video, warm community intro.

3. **HIGH: 4-vertical parallel test = avoiding commitment.** Solo founder doing 4 things poorly > 1 thing well. Suggests sequential testing, starting with PI lawyers (highest CAC = highest willingness to pay).

4. **HIGH: 6-month regret is clear.** Polished outreach machine, <5 paying customers. No revenue model testing in the plan.

5. **HIGH: Zero competitive moat.** Semrush/Ahrefs could ship this in a quarter. The moat is the data asset (10K business scans), not the scan tool.

6. **HIGH: Email discovery creates legal/deliverability risk.** Scraping social media for emails violates ToS. No CAN-SPAM physical address. Recommends separate domain for cold outreach.

7. **MEDIUM: Time estimates are fantasy.** "~2 hours CC time" for 7 fixes is optimistic. Recommends ordering by information value, not ease.

### CODEX SAYS (CEO — strategy challenge)

Codex spent 10 minutes reading repository files but **timed out before producing conclusions**. It correctly identified the key pattern ("the plan assumes the bottleneck is operational throughput") but didn't complete the analysis. Tagged `[subagent-only]`.

### CEO DUAL VOICES — CONSENSUS TABLE:

```
═══════════════════════════════════════════════════════════════
  Dimension                           Claude  Codex  Consensus
  ──────────────────────────────────── ─────── ─────── ─────────
  1. Premises valid?                   NO      N/A    FLAGGED
  2. Right problem to solve?           NO      N/A    FLAGGED
  3. Scope calibration correct?        NO      N/A    FLAGGED
  4. Alternatives explored?            NO      N/A    FLAGGED
  5. Competitive risks covered?        NO      N/A    FLAGGED
  6. 6-month trajectory sound?         NO      N/A    FLAGGED
═══════════════════════════════════════════════════════════════
Note: Codex timed out — single-model review only.
All 6 dimensions flagged by Claude subagent.
```

### NOT in scope (deferred)

| Item | Rationale |
|---|---|
| Fix 2: AI scan on preview | P3 — emails work without scans; optimize after validation |
| Fix 6: PostHog analytics | P3 — Resend webhooks already track opens/clicks |
| Full SMTP RCPT TO verification | P5 — brittle across providers; MX + disposable blocklist is sufficient |
| Multi-vertical generalization | Design doc says validate one vertical first |

### Error & Rescue Registry

| Error Scenario | Current Handling | Gap? |
|---|---|---|
| Resend API key invalid | 500 error, modal shows error banner | Fix 1 may be this — investigate |
| Email not found for prospect | Skip silently during discovery | OK for now |
| DuckDuckGo rate-limited | Not yet built | Need backoff in Fix 3 |
| MX lookup timeout | Promise rejection | Add timeout to validateEmail |
| Email bounce after send | Resend webhook updates email_events | Already handled |

### Failure Modes Registry

| Failure | Impact | Mitigation |
|---|---|---|
| All Apify tokens exhausted | Falls back to free scraping | Already built |
| Scraping targets block NeoBot UA | Silent failure, no emails found | Add retry with browser UA |
| Pattern-guessed emails are wrong | Sends to non-existent addresses | MX validation catches bad domains |
| Cold emails marked as spam | Domain reputation damage | Use separate outreach domain |

### CEO Completion Summary

```
+====================================================================+
|              CEO REVIEW — COMPLETION SUMMARY                        |
+====================================================================+
| System Audit         | Design doc found, 30 commits, clean tree    |
| Step 0A (Premises)   | 2 CRITICAL tensions identified              |
| Step 0B (Leverage)   | Fix 1 root cause likely API, not frontend   |
| Step 0C (Dream)      | Plan moves sideways, not toward 12mo ideal  |
| Step 0C-bis (Alts)   | 3 approaches; B selected (SELECTIVE EXP)    |
| Step 0D (Mode)       | SELECTIVE EXPANSION: blast-radius only       |
| Step 0E (Temporal)   | ~45 min CC total for modified scope          |
| Step 0F (Selection)  | SELECTIVE EXPANSION confirmed                |
| Dual Voices          | Claude: 7 findings. Codex: timed out.        |
| Consensus            | 6/6 flagged (single-model)                   |
| Scope decisions      | Fix 2 deferred, Fix 6 deferred, SMTP dropped |
+--------------------------------------------------------------------+
| IN scope: ALL 7 FIXES (user override at premise gate)              |
| DEFERRED: Nothing — full plan approved                              |
+====================================================================+

---

## DESIGN REVIEW (Phase 2) — /autoplan

**Initial rating: 3/10.** Plan describes what to build but never what the user sees.

### Design Specifications Added (auto-decided)

**Fix 1 — Send Success Sequence:**
1. User clicks Send → button shows `<Loader2>` spinner + "Sending..."
2. On success: button becomes green `<CheckCircle2>` for 800ms
3. Modal fades out (200ms ease-out)
4. Prospect row status badge animates to "Emailed"
5. Toast appears (bottom-right): "Email sent to {email}" — 4s auto-dismiss
6. On error: inline red alert below Send button inside modal, edits preserved

**Fix 2 — AI Scan Loading UX:**
1. User clicks Preview Email → if no scan report exists:
2. Modal opens with skeleton layout + "Running AI visibility scan for {businessName}... ~30-60 seconds"
3. Indeterminate progress bar (shadcn Progress component)
4. After scan completes: skeleton replaced with real email content
5. Timeout at 90s: "Scan is taking longer than expected" + two buttons: "Send without scan data" / "Try again"
6. If scan report already exists: instant preview (no loading)

**Fix 4 — Validation Indicator:**
- Three states: **Verified** (green dot, `CheckCircle2`), **Unverified** (yellow dot, `AlertCircle`), **Invalid** (red dot, `X`)
- Small 14px icon immediately before email text, matching existing status dot pattern
- Tooltip on hover shows reason: "MX verified", "MX lookup timed out", "Disposable domain"
- Validation runs async during discovery; pulsing animation while pending
- Re-runs on inline email edit (debounced 500ms after typing stops)

**Fix 5 — Inline Email Edit:**
- Click pencil icon (or email text) → email span becomes `<Input>` with same `text-xs` sizing
- Auto-focus with full email selected
- Enter: save + trigger async validation. Escape: revert
- Click away without Enter: revert (no auto-save)
- Brief "Saved ✓" indicator that fades after 1.5s
- For prospects with no email: show "Add email" placeholder link

**Fix 7 — Toast Implementation:**
- Install `sonner` library, add `<Toaster />` to `layout.tsx`
- Position: bottom-right (avoids sticky header conflict)
- Duration: 4 seconds
- Max stack: 3 visible, older ones dismissed
- Use `toast.success("Email sent to {email}")` for sends
- Use `toast.error("Failed to send: {reason}")` for failures

**Fix 6 — PostHog Event Naming:**
```
prospect_discovered     { city, vertical, count }
email_preview_opened    { prospect_id, has_scan_report }
ai_scan_triggered       { prospect_id, cached }
email_sent              { prospect_id, variant }
email_edited            { prospect_id }
page_viewed             { path }
```

### Interaction State Table (completed)

```
FEATURE              | LOADING             | EMPTY              | ERROR              | SUCCESS            | PARTIAL
---------------------|---------------------|--------------------|--------------------|--------------------|---------
Fix 1: Email send    | Spinner on btn      | N/A                | Inline alert in    | Checkmark 800ms    | N/A
                     |                     |                    | modal, edits kept  | → close → toast    |
Fix 2: AI scan       | Skeleton modal +    | N/A                | "Scan failed" +    | Skeleton → content | Timeout:
                     | progress bar        |                    | retry button       | transition         | skip option
Fix 3: Email find    | Discovery spinner   | "No email found"   | Silent per-source  | Email + validation | Some sources
                     |                     | + "Add email" link | fallback to others | dot appears        | fail → use what works
Fix 4: Validation    | Pulsing dot         | N/A                | Red dot + tooltip  | Green dot          | Yellow dot
Fix 5: Inline edit   | N/A                 | "Add email" link   | Red outline +      | "Saved ✓" fade     | N/A
                     |                     |                    | tooltip             |                    |
Fix 6: PostHog       | N/A                 | N/A                | Silent (analytics) | N/A                | N/A
Fix 7: Toast         | N/A                 | N/A                | Red toast          | Green toast        | N/A
```

### CLAUDE SUBAGENT (design — independent review) [subagent-only]

12 findings total (2 critical, 6 high, 4 medium). Key insights:
- **CRITICAL:** Fix 2 has zero UI spec for 30-60s loading. User will think tool is broken.
- **CRITICAL:** Plan adds 10+ data points per prospect row with no layout guidance.
- **HIGH:** Fix 1 modal error location inconsistent (inside vs outside modal).
- **HIGH:** Fix 4 "yellow warning" was undefined.
- **HIGH:** Fix 3 no UI for email source/confidence.
- **HIGH:** Optimistic update rollback when API fails silently.

### CODEX SAYS (design — UX challenge)

Codex timed out before producing conclusions (same pattern as CEO phase). Tagged `[subagent-only]`.

### Design Completion Summary

```
+====================================================================+
|         DESIGN PLAN REVIEW — COMPLETION SUMMARY                    |
+====================================================================+
| System Audit         | No DESIGN.md, shadcn/ui + dark theme        |
| Step 0               | 3/10 initial, 7 dimensions reviewed         |
| Pass 1  (Info Arch)  | 4/10 → 7/10 (2-line row layout specified)  |
| Pass 2  (States)     | 2/10 → 8/10 (full state table added)       |
| Pass 3  (Journey)    | 5/10 → 8/10 (scan loading + send sequence) |
| Pass 4  (AI Slop)    | 7/10 → 8/10 (Sonner specified, no generic) |
| Pass 5  (Design Sys) | 6/10 → 7/10 (existing tokens reused)       |
| Pass 6  (Responsive) | 2/10 → 4/10 (noted, not fully spec'd)      |
| Pass 7  (Decisions)  | 6 resolved, 0 deferred                      |
+--------------------------------------------------------------------+
| NOT in scope         | Full responsive spec (3 items)              |
| What already exists  | shadcn/ui, Lucide, dark theme, status dots  |
| TODOS.md updates     | 0 items                                     |
| Decisions made       | 10 added to plan                            |
| Overall design score | 3/10 → 7/10                                 |
+====================================================================+

---

## ENG REVIEW (Phase 3) — /autoplan

### Architecture Diagram

```
Admin Prospects Page (React)
    │
    ├── Discover ──→ scan-city route ──→ prospects.ts
    │                                    ├── Apify API (primary)
    │                                    ├── DuckDuckGo scrape (fallback)
    │                                    ├── YellowPages scrape (fallback)
    │                                    ├── findEmailFromWebsite() (current)
    │                                    ├── findEmailAdvanced() [NEW - Fix 3]
    │                                    │   ├── DuckDuckGo email search
    │                                    │   ├── Pattern guessing + MX
    │                                    │   └── (Yelp/FB/LinkedIn - ToS risk)
    │                                    └── validateEmail() [EXTENDED - Fix 4]
    │                                        ├── MX lookup (exists)
    │                                        ├── Disposable blocklist [NEW]
    │                                        └── SMTP RCPT TO [NEW]
    │
    ├── Preview ──→ PUT send-email ──→ getProspectWithReport() [NEW shared helper]
    │               [Fix 2: trigger scan if no report]
    │               └──→ scan logic (extracted from scan route) [NEW]
    │                    └──→ Perplexity API (10 queries, cached)
    │
    ├── Send ────→ POST send-email ──→ Resend API
    │              └──→ saveEmailSend() + updateProspectStatus()
    │
    ├── Inline Edit [NEW - Fix 5] ──→ PATCH prospect email
    │              └──→ validateEmail() async
    │
    ├── Toast [NEW - Fix 7] ──→ Sonner library
    │
    └── PostHog [NEW - Fix 6] ──→ posthog-js (client-side)
```

### Scope Challenge

Plan touches **8 files** (triggers complexity smell). However, all are in the outreach module's blast radius. No new services or classes are introduced — it's extending existing functions and adding UI components. **Within acceptable limits (P2 boil lakes).**

### Key Engineering Findings

**1. Fix 1 root cause needs investigation, not code change (CRITICAL)**
The code at `page.tsx:233` already calls `setEmailModal(null)` on success. The plan's diagnosis ("frontend doesn't close modal") contradicts the code. The actual bug is likely:
- Resend API returning an error (key permission, domain mismatch)
- The `saveEmailSend()` call after send throws, hitting the catch block
- The `requireAdmin()` check failing silently

**Recommendation:** Start Fix 1 by adding `console.log` before/after `resend.emails.send()` and testing with the actual API key. Don't rewrite the frontend until you've confirmed the backend works.

**2. Fix 2 scan extraction needs careful decoupling (HIGH)**
The scan logic in `src/app/api/scan/route.ts` includes auth checks, input sanitization, query generation, batch running, scoring, fix generation, and report saving. Extracting this into a reusable function means deciding: does the preview endpoint run the full pipeline (including fix generation) or a lightweight version?

**Recommendation:** Extract `runScanForBusiness(businessName, businessUrl, city, queryCount, runsPerQuery)` that returns a ScanReport. Keep fix generation as a separate step. The preview endpoint runs the scan + fix generation (user needs to see the full report data). Add a `scanInProgress` Map keyed by `businessUrl` to prevent concurrent scans.

**3. Fix 3 email discovery — scraping reliability is the hidden complexity (HIGH)**
DuckDuckGo frequently changes HTML structure, returns CAPTCHAs after a few requests, and blocks automated scraping. Yelp aggressively rate-limits scrapers. Facebook and LinkedIn require authentication for most profile data.

**Recommendation:** Keep the plan's approach but be realistic:
- DuckDuckGo email search: likely to work for small volumes (<100/day)
- Pattern guessing + MX validation: most reliable new source
- Yelp/Facebook/LinkedIn: drop from v1. ToS risk + unreliable
- Add fallback ordering: website scrape → DuckDuckGo → pattern guessing

**4. CAN-SPAM compliance gap (HIGH)**
The email template in `email-templates.ts` is missing a physical mailing address, which is required by CAN-SPAM for commercial emails. The unsubscribe link exists (good), but the physical address is legally required.

**5. Missing: separate email domain for cold outreach (MEDIUM)**
Sending cold outreach from `neorank.co` or `abdik.me` risks the primary domain's sender reputation. If bounces exceed 2%, Resend may throttle or suspend the account.

### Test Coverage Diagram

```
COVERAGE: 3/19 paths tested (16%)
GAPS: 16 paths need tests (2 need E2E)

Priority test additions:
1. [UNIT] findEmailAdvanced() — DuckDuckGo parsing, pattern guessing, parallel fallback
2. [UNIT] validateEmailDeep() — disposable blocklist, SMTP RCPT TO mock
3. [UNIT] getProspectWithReport() — shared helper with and without scan report
4. [UNIT] Scan extraction — runScanForBusiness() with mocked Perplexity
5. [INTEGRATION] PUT send-email — preview triggers scan, returns preview data
6. [INTEGRATION] POST send-email — success path, Resend error, saveEmailSend failure
7. [E2E] Full outreach flow — discover → preview → send → toast
8. [E2E] Email validation lifecycle — discover → validate → edit → re-validate
```

Test plan artifact written to: `~/.gstack/projects/beknazar-neo/abdik-main-eng-review-test-plan-20260327-095500.md`

### CLAUDE SUBAGENT (eng — independent review) [subagent-only]

18 findings (2 critical, 8 high, 8 medium). Key discoveries:

**PRE-EXISTING BUGS (fix BEFORE the v2 plan):**

1. **CRITICAL: Manual send missing `resend_id` and unsubscribe footer.** The POST handler in `send-email/route.ts` never captures the Resend message ID (so webhooks can't match opens/clicks) and never calls `addUnsubscribeFooter()` (the cron route does both). Every manual send is a CAN-SPAM violation and invisible to tracking. **Fix immediately.**

2. **CRITICAL: Warmup schedule has no daily cap.** `perRunLimit` limits per-cron-run but not per-day. Cron runs every 15 min (96x/day). Day-1 limit of 5 emails could actually send 480. **Add `getDailySentCount()` check.**

3. **HIGH: Cron auth is fail-open.** `CRON_SECRET` check only runs if the env var exists. Missing env var = unauthenticated email trigger. **Fail closed: return 500 if not configured.**

4. **HIGH: Unsubscribe triggers on GET.** `/unsubscribe/[token]/page.tsx` executes unsubscribe on server render. Email link prefetchers (Outlook SafeLinks, Google) will auto-unsubscribe. **Add confirmation button, unsubscribe on POST.**

**V2 PLAN FINDINGS:**

5. **HIGH: Fix 2 scan-on-preview will hit Vercel function timeout.** PUT endpoint has no `maxDuration`. A 60s scan will fail on Hobby (10s default). **Add `export const maxDuration = 120`.**

6. **HIGH: Pattern-guessed emails produce hard bounces.** MX validates domain, not mailbox. `contact@legit-domain.com` may not exist. >5% bounce rate = Resend suspension. **Keep SMTP RCPT TO for guessed emails only, or require manual confirmation via Fix 5.**

7. **HIGH: `previewLoading` is global.** One loading preview disables all Preview buttons. **Change to `previewLoadingId: string | null`.**

8. **HIGH: In-memory token exhaustion state lost on cold starts.** Apify token exhaustion tracking uses module-level Map, lost between serverless invocations.

9. **MEDIUM: 30-day scan cache has no invalidation.** Stale scores in emails if business improves.

10. **MEDIUM: `SELECT *` exposes all prospect columns to frontend.** Use explicit column list.

### CODEX SAYS (eng — architecture challenge)

Codex timed out before producing conclusions (consistent pattern across all 3 phases). Tagged `[subagent-only]`.

### ENG DUAL VOICES — CONSENSUS TABLE:

```
═══════════════════════════════════════════════════════════════
  Dimension                           Claude  Codex  Consensus
  ──────────────────────────────────── ─────── ─────── ─────────
  1. Architecture sound?               YES     N/A    ACCEPTED
  2. Test coverage sufficient?         NO      N/A    FLAGGED
  3. Performance risks addressed?      YES     N/A    ACCEPTED
  4. Security threats covered?         NO      N/A    FLAGGED
  5. Error paths handled?              NO      N/A    FLAGGED
  6. Deployment risk manageable?       YES     N/A    ACCEPTED
═══════════════════════════════════════════════════════════════
Note: Codex timed out. Claude subagent still running at gate time.
```

### Eng Completion Summary

```
+====================================================================+
|              ENG REVIEW — COMPLETION SUMMARY                        |
+====================================================================+
| System Audit         | 131 tests, Vitest, 16% coverage for plan    |
| Step 0 (Scope)       | 8 files — acceptable (blast radius)         |
| Section 1 (Arch)     | Architecture sound, one coupling concern     |
| Section 2 (Quality)  | 2 DRY violations, 1 error handling gap      |
| Section 3 (Tests)    | 16 test gaps identified, test plan written   |
| Section 4 (Perf)     | Concurrency limiter needed for Fix 3         |
| Dual voices          | Claude: 18 findings. Codex: timed out.       |
| Consensus            | 2/6 accepted, 4/6 flagged (single-model)     |
+--------------------------------------------------------------------+
| Critical findings: Fix 1 root cause is backend, not frontend       |
|   CAN-SPAM: physical address missing + no unsubscribe on manual    |
|   Warmup bypass: 480 emails/day instead of 5 (pre-existing bug)    |
|   Cron fail-open: missing env var = unauthenticated endpoint       |
| Test plan artifact: ~/.gstack/projects/beknazar-neo/...test-plan   |
+====================================================================+

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | issues_open | 2 critical (plan contradicts design doc, unvalidated premise), 5 high |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | issues_open | 2 critical (scan loading UX, row density), 10 decisions added |
| Eng Review | `/plan-eng-review` | Architecture & tests | 1 | issues_open | 2 critical (manual send CAN-SPAM, warmup bypass), 8 high, 16 test gaps |
| CEO Voices | `/autoplan` | Cross-model strategy | 1 | subagent-only | 7 subagent findings, Codex timed out |
| Design Voices | `/autoplan` | Cross-model design | 1 | subagent-only | 12 subagent findings, Codex timed out |
| Eng Voices | `/autoplan` | Cross-model eng | 1 | subagent-only | 3/6 accepted, 3/6 flagged, Codex timed out |

**VERDICT:** APPROVED with 35 decisions (25 auto + 2 user overrides + 1 gate approval + 7 post-gate eng subagent findings). User chose full plan scope.

### REVISED IMPLEMENTATION ORDER (incorporating eng subagent findings)

**Phase 0 — Pre-existing bugs (fix BEFORE v2 work):**
0a. Add `resend_id` capture + `addUnsubscribeFooter()` to manual send endpoint
0b. Add daily sent counter to cron warmup schedule
0c. Fail closed on missing `CRON_SECRET`
0d. Change unsubscribe from GET-triggered to POST with confirmation button

**Phase 1 — Core fixes:**
1. Debug Fix 1 (investigate Resend API error — root cause is backend)
2. Fix 7 (install Sonner, add toast — unblocks success feedback)
3. Fix 4 (email validation — MX + disposable blocklist + SMTP for guessed emails only)

**Phase 2 — Email discovery:**
4. Fix 3 (all sources: website + DuckDuckGo + Yelp + FB + LinkedIn + pattern guessing)
5. Fix 5 (inline email edit — critical for manually confirming guessed emails)

**Phase 3 — AI scan + analytics:**
6. Fix 2 (AI scan on preview — add `maxDuration = 120`, skeleton modal UX, scan mutex)
7. Fix 6 (PostHog analytics)

Suggest `/ship` when ready.
```
```
