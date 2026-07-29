# Tackly — Build Plan & Architecture

> **This is the single source of truth** for product decisions, architecture, prompts, billing safety, and the build history. Detailed dated investigation notes (bugs found, root causes, fixes, verification) live in [FINDINGS.md](FINDINGS.md) instead of cluttering this file — this file is "what's true now and why," FINDINGS.md is "how we got here."

**Live app**: https://tackly.co
**Product Hunt Launch (Top #13):** https://www.producthunt.com/products/tackly

---

## Contents

1. [North Star & Scope](#1-north-star--scope)
2. [Current Status (Shipped)](#2-current-status-shipped)
3. [Recent Updates](#3-recent-updates)
4. [Tech Stack & Setup](#4-tech-stack--setup)
5. [Environment Secrets](#5-environment-secrets)
6. [Dual Capture Pipelines](#6-dual-capture-pipelines-personal-vs-meetingtranscript)
7. [Calendar Integration (Recall Calendar V1, Google only)](#7-calendar-integration-recall-calendar-v1-google-only)
8. [Stripe Billing (checkout + webhook)](#8-stripe-billing-checkout--webhook)
9. [LLM Cost & Pipeline Economics](#9-llm-cost--pipeline-economics)
10. [Node Taxonomy & Classification Pipeline](#10-node-taxonomy--classification-pipeline)
11. [Data Model](#11-data-model)
12. [Pages & Flows](#12-pages--flows)
13. [Design Direction](#13-design-direction)
14. [Phased Build Plan](#14-phased-build-plan)
15. [Open Questions](#15-open-questions)
16. [Configurable Per-Tier LLM Provider](#16-configurable-per-tier-llm-provider)
17. [TacklyAI — Board Assistant](#17-tacklyai--board-assistant)
18. [Articles/Blog + SEO](#18-articlesblog--seo)

---

## 1. North Star & Scope

Tackly turns spoken or typed thought — a meeting, a rambling voice note, a solo brainstorm — into a living map of nodes instead of a linear transcript or summary. What makes it different from adjacent tools: **dual mode.** The same engine works for team meetings (multi-speaker, imported or live transcript) and personal thinking (hold-a-key-to-talk, solo). It's a thinking tool that also happens to handle meetings, not a meeting tool with a personal mode bolted on.

Design feel: Apple-level restraint in the chrome, Letterly-level warmth and approachability, nodes styled like physical post-it notes — playful and tactile without tipping into a kids'-app look. Startupy, not clinical.

v1 scope decision: meeting capture is live from the start, via Recall (a meeting-bot API) — paste/import transcript remains as a secondary path for meetings already recorded elsewhere, not the only option. Both personal hold-to-talk and meeting-bot capture feed the same real-time utterance pipeline; the pipeline itself doesn't care whether an utterance came from a browser mic or a bot in a call.

**Scope cut, worth knowing if revisited:** cross-session memory (recognizing when a new thought connects to something from a *previous* session, not just earlier in the current one) was considered and cut for this build — matching happens within a session only. It was the sharpest differentiator from tools scoped the same way (single board/session), but not needed to ship something genuinely good now.

---

## 2. Current Status (Shipped)

Tackly is a fully working, Product Hunt-launched product (Top #13 Product of the Day):

- Real-time personal hold-to-talk (AssemblyAI)
- Live meeting bots (Recall.ai) for Google Meet / Zoom / Teams — no calendar integration needed, joins instantly via a pasted link, leaves automatically once the meeting ends
- Transcript import
- Two-tier LLM classification pipeline (Tier 1 real-time + Tier 2 consolidation), sub-second live node rendering
- Live node graph with smart arched connectors
- Board/session export (PNG, SVG, or a direct Markdown file)
- Board-scoped AI assistant ("TacklyAI")
- Stripe billing + usage quotas
- Admin panel
- Articles/blog with an admin editor
- Full delta-based realtime frontend via `SessionOp`

The core experience is production-usable.

---

## 3. Recent Updates

Newest first. Each links to the detailed investigation in [FINDINGS.md](FINDINGS.md) where one exists.

- **2026-07-25 — New "Update" node type.** A first-class node type for "we changed/fixed/added X" reports that were previously getting silently absorbed into an unrelated node's summary. See [§10](#10-node-taxonomy--classification-pipeline), [FINDINGS.md §10](FINDINGS.md#10-new-update-node-type-2026-07-25).
- **2026-07-25 — Umbrella-node fact-folding (Tier 1) + parent/child merge (Tier 2) fixes.** A broad topic node was absorbing distinct new facts instead of spinning off children; separately, Tier 2 was merging an already-correct parent/child pair. Fixed with prompt rules plus a hard code-level guard against merging a node into its own parent/child. [FINDINGS.md §9](FINDINGS.md#9-umbrella-node-over-folding-tier-1--parent-merged-into-its-own-child-tier-2-2026-07-25).
- **2026-07-25 — Trailing-clause bug fixed.** An utterance split mid-clause across two STT turns was losing its content on completion instead of expanding the right placeholder node. [FINDINGS.md §8](FINDINGS.md#8-trailing-clause-bug--a-plan-node-that-never-registered-2026-07-25).
- **2026-07-25 — Live-classification feel: less flicker, fewer vanishing nodes, no more fact-squashing.** Stage-2 rough guesses now fire once per forming node instead of repeatedly; Tier 1 now prefers connecting distinct new content over folding it into an existing node. [FINDINGS.md §7](FINDINGS.md#7-live-classification-feel-flicker-vanishing-nodes-fact-squashing-2026-07-25).
- **2026-07-25 — Articles/blog, footer + closing-CTA redesign, SEO polish.** New database-backed `Article` entity + admin editor, per-article SEO/JSON-LD, footer and closing-CTA redesign. See [§18](#18-articlesblog--seo), [FINDINGS.md §6](FINDINGS.md#6-articlesblog-footer--closing-cta-redesign-seo-polish-2026-07-25).
- **2026-07-24/25 — TacklyAI board assistant shipped.** Session-scoped Q&A assistant, nothing persisted, live on Gemini. See [§17](#17-tacklyai--board-assistant), [FINDINGS.md §5](FINDINGS.md#5-tacklyai--build-rounds--verification-2026-07-24--2026-07-25).
- **2026-07-24 — Configurable per-tier LLM provider.** Tier 1/Tier 2/chat can each be pointed at Anthropic or Gemini from Admin, no redeploy needed. See [§16](#16-configurable-per-tier-llm-provider), [FINDINGS.md §4](FINDINGS.md#4-configurable-per-tier-llm-provider--activation-log-2026-07-24).
- **2026-07-24 — Mobile touch fixes + dynamic email-first auth.** Canvas panning fixed on touch, iOS input auto-zoom fixed globally, auth rebuilt as a single email-first flow. [FINDINGS.md §3](FINDINGS.md#3-mobile-touch-fixes--dynamic-email-first-auth-2026-07-24).
- **2026-07-24 — Cost pipeline optimization, rounds 1-6.** Cut real session cost from ~$0.0667/min to ~3¢/min via Tier-2 frequency/model changes, `openList` windowing, a filler pre-filter, live Tier-1 batching, and cost tracking. See [§9](#9-llm-cost--pipeline-economics), [FINDINGS.md §1](FINDINGS.md#1-cost-audit--transcript-to-node-pipeline-2026-07-24-rounds-1-6).

---

## 4. Tech Stack & Setup

### Core Stack

| Layer              | Choice                                      | Notes |
|--------------------|---------------------------------------------|-------|
| Backend            | Base44 (BaaS)                               | Entities, functions, auth, realtime, secrets, hosting |
| Frontend           | React + Vite + Tailwind                     | Neubrutalist design system |
| AI (Tier 1 & 2)    | Direct Anthropic + Google Gemini            | Not using Base44 `InvokeLLM` — see §16 |
| Personal STT       | AssemblyAI (`universal-streaming`)          | Official SDK |
| Meeting capture    | Recall.ai                                   | Bot joins the call + streams transcript |
| Payments           | Stripe                                      | Checkout + Customer Portal + webhooks |
| Transactional email| Resend                                      | Custom themed emails |

### Why these choices

- **Backend**: Base44 backend platform. First step: `npx base44 create` to provision database, auth, functions, storage, realtime.
- **Frontend**: web app built on top of the Base44-generated backend, plain routing for two areas — the main app (`/app/...`) and a role-gated admin area (`/admin/...`).
- **Direct Anthropic / Gemini calls** instead of Base44 `InvokeLLM` — `InvokeLLM` has a fixed ~2 second floor and no model selection. Direct calls give sub-second Tier 1 latency, prompt caching, and don't consume Base44 integration credits (per Base44's own docs, integration credits are only charged for Base44's built-in services — calls made via your own API key don't touch that pool). Tier 1 (per-utterance classification) uses `claude-haiku-4-5-20251001` — fast, well-suited to a small, well-defined task. Tier 2 (periodic consolidation) currently uses Haiku as well, via a forced tool call (see §9 for why it moved off Sonnet+thinking). Prompt caching is used on every tier's system prompt since it's static across calls.
- **AssemblyAI official SDK** (not raw WebSocket) — correctly handles session termination. Critical because AssemblyAI bills for connection time, not speech time.
- **Recall.ai for meetings** — the bot is a real call participant with built-in transcription. No need to run a separate STT service on meeting audio.
- Node matching is same-session only and runs directly off the small list of currently-open nodes in the LLM call — no embeddings or vector search needed.

Speech-to-text, personal mode: browser mic → streaming STT via AssemblyAI, model `universal-3-5-pro` (realtime), via the official AssemblyAI SDK — not raw WebSocket, since the SDK handles session termination correctly and that's the specific mechanism that causes overcharges if hand-rolled. See `docs/assemblyai-agent-instructions.md` for the exact integration pattern — read it in full, and follow its Operating Rules, before touching this integration; don't rely on memorized AssemblyAI parameter names.

### Billing Safety (Personal Mode)

AssemblyAI bills for connection time, not actual speech time — a session left open costs the same whether the user is talking or silent. So "hold to talk" **must**:

1. Open a fresh connection only when the key is pressed.
2. Immediately send `Terminate` when the key is released.
3. Enforce a hard server-side `max_session_duration_seconds` (currently 600s, well below the 3-hour default cap) as a safety net in case a client-side close ever fails to fire (crash, dropped network, force-quit).

This was designed in from day one, not added later.

### Billing Safety (Meeting Mode)

Speech-to-text + capture, meeting mode: Recall (meeting-bot API). A bot joins the meeting via a pasted call link, and Recall streams real-time transcript events to a webhook endpoint in a Base44 function. Recall's realtime events and AssemblyAI's personal-mode Turn events both resolve to the same shape (speaker, text, finalized) before hitting the Tier-1 classifier — one ingestion function, two sources. `automatic_leave` is set explicitly on bot creation (silence detection, bot-only detection, waiting room timeout) rather than relying silently on Recall's defaults — same values are fine, just made visible in the code rather than implicit.

Lower risk here by design — Recall's bots leave automatically within seconds of every human participant leaving the call, plus built-in timeouts for an empty waiting room or nobody ever joining. Defaults are sensible; no extra cap needed on top, unlike personal mode above.

### Local Development

```bash
npm install
npx base44 dev
```

### Backend Deployment

```bash
npx base44 entities push     # Push schema changes to database
npx base44 functions deploy  # Deploy backend serverless functions
```

---

## 5. Environment Secrets

Set runtime backend keys via Base44 secrets — **never paste actual key values in chat or commit them.** This list is verified against `npx base44 secrets list` (not just grep'd from code), so it reflects what's actually configured in production:

```bash
npx base44 secrets set ASSEMBLYAI_API_KEY=value
npx base44 secrets set RECALL_API_KEY=value
npx base44 secrets set RECALL_VERIF_SECRET=value
npx base44 secrets set ANTHROPIC_API_KEY=value
npx base44 secrets set GOOGLE_T1T2_SECRET=value
npx base44 secrets set STRIPE_SECRET_KEY=value
npx base44 secrets set STRIPE_WEBHOOK_SECRET=value
npx base44 secrets set RESEND_API_KEY=value
npx base44 secrets set GOOGLE_CALENDER_CLIENT_ID=value
```

Notes on the less obvious ones:
- `RECALL_VERIF_SECRET` — single workspace verification secret (Recall dashboard → API keys page) that signs *all* Recall webhook deliveries — both the per-bot `realtime_endpoints` traffic (`recall-webhook`) and the dashboard-registered bot status webhook (`recall-status-webhook`). One secret, two consumers (`base44/shared/recallVerify.ts`).
- `GOOGLE_T1T2_SECRET` — supports the configurable Tier 1 / Tier 2 / chat LLM provider setup (§16), alongside `ANTHROPIC_API_KEY`.
- `GOOGLE_CALENDER_CLIENT_ID` — **note the spelling**: the secret is actually stored as `GOOGLE_CALENDER_CLIENT_ID` (missing the "A"), and `recall-calendar-connect-url/entry.ts` reads it under that exact name deliberately, matching what's set in Base44 — not a typo to "fix," changing it would break the calendar connect flow. Only the client ID lives here; the OAuth client *secret* lives in Recall's own dashboard (uploaded there during Recall's setup steps, never touches our code) since Recall's callback does the code↔token exchange server-side.
- `RESEND_API_KEY` — themed transactional emails (welcome, quota-warning, plan-upgraded), sent from `noreply@app.tackly.co`, separate from Base44's own un-customizable OTP/reset emails.
- `RECALL_REGION` — optional, not currently set as a secret. Defaults to `"eu-central-1"` in code (`recall-start-bot`, `recall-stop-bot`, `recall-calendar-*`) if unset; only needs setting if the Recall API key's region ever changes.

---

## 6. Dual Capture Pipelines (personal vs. meeting/transcript)

These share the Tier-1/Tier-2 classification pipeline and the ops-log realtime delivery, but capture works completely differently. Worth keeping straight — they are not the same code path with a flag, they're two separate ingestion routes that both happen to write `Utterance` rows.

| | Personal (hold-to-talk) | Meeting (bot) | Meeting (imported transcript) |
|---|---|---|---|
| `Session.capture_source` | `mic_live` | `bot_live` | `import` |
| `Session.type` | `personal` | `meeting` | `meeting` |
| Who transcribes | **AssemblyAI**, browser mic, streaming SDK | **Recall**, bot joins the call — Recall does its own transcription (`recallai_streaming` provider), we never touch AssemblyAI for this path | Nobody — text is pasted/uploaded already-transcribed (`src/lib/transcript.js` parses it) |
| Ingestion | `useHoldToTalk.js` → `classify-partial` (provisional) → `process-session` (final), per hold-press | `recall-webhook` (`transcript.data` events) → `Utterance.create` per finalized chunk, service-role write | `NewSession.jsx` bulk-creates all utterances up front, then `process-session` batches through them |
| Speaker labels | Always "Me" (one speaker) | Recall's diarization — `participant.name` if the platform provides it, else `Speaker <id>` — carried straight into `Utterance.speaker_label` | Whatever the pasted transcript's "Name:" prefixes say (`parseTranscript`) |
| Realtime cadence | As fast as AssemblyAI finalizes a turn (sub-second, batched — see §9) | As fast as Recall's `recallai_streaming` finalizes a chunk and fires the webhook — same realtime, per-utterance shape as personal mode, not a batch/delay | N/A — all utterances exist immediately, `process-session` just churns through `IMPORT_BATCH_SIZE` (12) at a time |
| Hold-to-talk available? | Yes, the whole time | **No** — there's no browser mic session during a live meeting, Recall's bot is the only capture source while `status === "active"`. Once the bot has left (`status` flips off `active`), the board shows a **"Continue this thread by voice"** button that re-opens the same session for mic capture — same lifecycle a personal session uses, just re-entered instead of started fresh (`Board.jsx` `micContinuing`) | No live capture at all — the session goes straight to `processing` after the bulk-create |
| How the session ends | User releases the hold key each turn; explicit "End session" flips `active → processing` | Three paths, in order of how often they fire: (1) **`participant_events.leave`** on the same automatic per-bot `realtime_endpoints` webhook (`recall-webhook`) — when the host leaves, the session auto-flips `active → processing`, the primary mechanism; (2) user clicks "End session" → `recall-stop-bot`, a manual override; (3) `recall-status-webhook` — a separate, project-wide webhook Recall calls on `bot.call_ended`/`bot.fatal`, requiring a one-time manual URL registration in Recall's dashboard — a defense-in-depth backstop, not load-bearing. The board also subscribes to `Session` realtime updates (plus a 3s poll fallback) while `isBotLive`. | Immediate — nothing to end |
| Billing minutes | Utterance timestamp span (real AssemblyAI turn timings) | Utterance timestamp span (real Recall segment timings) | Utterance timestamp span (synthetic — `parseTranscript` assigns 1s/line, since pasted text has no real timing) |

**Why Recall and not AssemblyAI for meetings:** Recall's bot is a call participant with its own transcription baked in — no separate STT vendor call on our side for meeting audio, and no way to run "hold to talk" against a call we're not producing audio into. AssemblyAI only ever sees the personal-mode browser mic stream.

---

## 7. Calendar Integration (Recall Calendar V1, Google only)

Lets a user connect their Google Calendar so Recall can send the bot automatically, instead of always pasting a meeting link by hand. Built against Recall's Calendar V1 docs (`docs.recall.ai/docs/calendar-v1-google-calendar`, region `eu-central-1`) — Microsoft Calendar is out of scope for now (only the Google OAuth client was created in Recall's dashboard).

**Currently paused in the UI, on purpose.** `GOOGLE_CALENDER_CLIENT_ID` is set and the flow below works end to end, but given the known gap further down (auto-joined bots don't feed a board yet), the "Connect Google Calendar" button in Settings intentionally shows a "Coming soon — invite the bot with a link instead" popup rather than starting OAuth, so nobody connects a calendar that looks live but silently does nothing useful yet. The backend (entity + both functions) is untouched and ready to wire back up.

**Flow:**
1. `/app/settings` → "Connect Google Calendar" calls `recall-calendar-connect-url`, which mints a fresh Recall calendar auth token (`POST /calendar/authenticate/`, `{user_id: user.id}` — tokens expire in 24h, so nothing is persisted, a new one is minted whenever needed) and builds the Google OAuth authorize URL, then the browser is redirected there directly.
2. Google's consent screen redirects to **Recall's own callback** (`https://eu-central-1.recall.ai/api/v1/calendar/google_oauth_callback/` — this is the redirect URI registered in the Google Cloud project, not ours). Recall exchanges the code for tokens server-side using the client secret already uploaded to Recall's dashboard — our code never sees a Google auth code or the client secret.
3. Recall then redirects the browser to `success_url`/`error_url` (passed inside the `state` param) — `https://tackly.co/app/settings?calendar=connected` or `?calendar=error`. `SettingsPage.jsx`'s `CalendarSection` picks that query param up on mount, writes/updates a `CalendarConnection` row for the now-still-logged-in user (plain frontend entity write, no backend function needed — RLS is self-scoped), and strips the param from the URL.
4. The auto-join toggle calls `recall-calendar-set-preferences`, which sets Recall's `override_should_record` preference (`PUT /calendar/user/`, `{external_id: user.id, preferences: {override_should_record: true|false}}`) — an unconditional force on/off, deliberately not the six granular `record_*` condition flags Recall's docs also expose, since their AND/OR combination logic isn't documented anywhere and wasn't safe to guess for a simple toggle.

**Known gap, not built yet — auto-joined bots don't produce a Tackly board.** Recall's calendar-scheduled bots use a single "Bot Config" preset configured once in *Recall's own dashboard* (not per-bot via our API the way `recall-start-bot` works), and Calendar V1 has no webhook telling us when one of those bots gets created. So today: a user can connect their calendar and flip auto-join on, and Recall genuinely will send a bot to their meetings — but until two more things happen, that bot's transcript goes nowhere in Tackly:
- **Manual step (theirs):** paste `recall-webhook`'s URL (`https://tackly.co/functions/recall-webhook`) into that dashboard Bot Config preset's realtime endpoints, with a static shared token in its metadata (there's no per-session token possible here, unlike manually-invited bots).
- **Code change (ours, not built):** `recall-webhook` currently only accepts events carrying a `webhook_token` that matches an *existing* `Session` row created by `recall-start-bot`. A calendar-originated bot has no such row — the webhook handler would need to recognize the static calendar token and lazily create a `Session` on first event, resolving the owning user via a bot-detail lookup (`GET /api/v1/bot/{id}/`) rather than from `metadata.session_id`.

Both are real, scoped pieces of work — flagging clearly rather than implying the connect/toggle UI already produces boards end-to-end.

---

## 8. Stripe Billing (checkout + webhook)

Real subscriptions, replacing the admin-only manual plan assignment as the primary way users end up on a paid plan (manual assignment in `/admin/users` still works, unchanged).

**How it's wired:**
- `Plan.stripe_price_id` — pairs each `Plan` row to a real Stripe recurring Price (`price_...`), set by hand at `/admin/plans` after creating the matching Price in the Stripe dashboard. A plan with no price id renders "Not available yet" instead of a broken checkout button, both in `/admin/plans` and in the Settings upgrade cards.
- `create-checkout-session` — authenticated function, `{plan_id}` → Stripe Checkout URL. Creates (and persists on `User.stripe_customer_id`) a Stripe Customer on first checkout; the session carries `client_reference_id` and `metadata.user_id`/`metadata.plan_id` (also copied onto `subscription_data.metadata`) so the webhook can resolve the right user without a second lookup.
- `create-billing-portal-session` — authenticated function, no input → Stripe Billing Portal URL, so users can update card details or cancel without any custom UI here.
- `stripe-webhook` — the source of truth. Verifies `Stripe-Signature` (`base44/shared/stripeVerify.ts`, same HMAC-SHA256 + Standard Webhooks-style approach as `recallVerify.ts`, plus a 5-minute timestamp tolerance) against `STRIPE_WEBHOOK_SECRET`, then on `checkout.session.completed` / `customer.subscription.updated` / `customer.subscription.deleted` updates `User.plan_id` + `stripe_subscription_id` (service role, same pattern as `admin-set-user-plan`). A canceled/unpaid subscription reverts `plan_id` to `""` (Free).
- Settings (`/app/settings`, `PlansSection` inside `SettingsPage.jsx`) — plan cards read straight from `Plan.list()`; "Upgrade" calls `create-checkout-session` and redirects; "Manage billing" (shown once `stripe_customer_id` exists) calls `create-billing-portal-session`. A `?checkout=success|cancel` query param (Stripe's own redirect) shows a themed popup confirmation and triggers one `refresh()` of the logged-in user.

**One-time manual setup (Stripe dashboard, can't be done via API):** add a webhook endpoint at `https://tackly.co/functions/stripe-webhook`, subscribed to at least `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` — then set the signing secret it gives you as `STRIPE_WEBHOOK_SECRET`. Done and connected.

**Not built:** proration/plan-switch UI beyond what the Billing Portal itself offers, invoices/receipts UI (Portal covers this too), failed-payment dunning emails.

**Free plan needs no Stripe price at all** — everyone's on it by default (`User.plan_id` empty). `Plan.stripe_price_id` gating (and the "Not available yet" state) only applies to paid plans; Free always renders as available/current, and includes meeting access (capped at 30 min/month like the others, not meeting-blocked).

**Public pricing** (`/plans`, `src/pages/Plans.jsx`) and a landing-page pricing section both render `src/components/PlanCards.jsx` — Free is always the primary, full-opacity card; Plus (the middle paid tier) always carries a "Most used" tag. Logged-out viewers get a "Get started" link to `/signup` on every plan instead of Upgrade buttons. Settings' own Plan section shows usage + "Manage billing" + a "View all plans →" button that pops `PlanCards` up in a centered `PlansModal`. Admins can edit each plan's marketing "perks" list directly from `/admin/plans` (`FeatureEditor`) alongside the Stripe Price id field.

---

## 9. LLM Cost & Pipeline Economics

Real usage testing on 2026-07-24 showed the pipeline running at roughly **$0.0667 per minute of session time** — real work went into bringing that down. Full round-by-round investigation, the pricing tables used, and a real fire-and-forget cost-write bug found along the way are in [FINDINGS.md §1](FINDINGS.md#1-cost-audit--transcript-to-node-pipeline-2026-07-24-rounds-1-6). Current state:

**The three LLM call sites**, all calling Anthropic/Gemini directly via `base44/shared/claude.ts` / `gemini.ts` / `llm.ts` (not Base44's `InvokeLLM` — no prompt caching or forced tool-use there):
1. **`classify-partial`** — Stage 2's debounced live "rough guess" on in-progress (non-final) utterance text. Fires **once per forming node** (throttled — see below), not on every debounce tick.
2. **`process-session`** — Tier 1, the authoritative per-utterance classification. Live capture batches finalized utterances client-side (`BATCH_DEBOUNCE_MS = 2500` / `BATCH_MAX_SIZE = 4`) into one call instead of one call per utterance; import/wrap-up mode batches up to `IMPORT_BATCH_SIZE = 12` at a time.
3. **`consolidate-session`** — Tier 2, periodic consolidation/merging. Runs every **20** utterances live (`sinceConsolidateRef`, up from an original 5) plus once at session end, on **Haiku 4.5 via a forced tool call** (moved off Sonnet + adaptive thinking, which was the original dominant cost driver). **Agreed fallback if Haiku's merge/cross-link judgment ever proves too weak: Sonnet with thinking explicitly OFF** — drops the thinking-token bill while keeping Sonnet's stronger reasoning. Don't silently revert to Sonnet+adaptive-thinking without a fresh decision.

**Current cost-control measures:**
- Tier 1's `openList` (the set of nodes offered as possible parents/attach targets) is windowed — every `topic` node + every still-open question/risk/action + the most recent `OPEN_LIST_RECENCY = 50` nodes — not the full unbounded graph. Tradeoff: a very old, already-resolved, non-topic node can age out and stop being offered as an attach target on a very long session; raise `OPEN_LIST_RECENCY` if that becomes a real problem rather than reverting the windowing.
- A filler pre-filter (`FILLER_WORDS`/`isPureFiller`) drops pure acknowledgement utterances ("okay", "yeah", "got it") before they reach the model at all, since Tier 1 would just classify them as skip anyway.
- Tier 2's node/edge payload is deliberately left **unwindowed** (full graph, up to 200 nodes/500 edges) — duplicate/cross-link detection benefits from seeing the whole graph regardless of recency, and Tier 2 is already both cheaper and far less frequent than before, so windowing it too would buy comparatively little.
- Stage 2 (`classify-partial`) fires only once per forming node (`stage2FiredRef`), not on every debounce tick — see §10 for why.

**Cost tracking**: every Anthropic/Gemini call's real token usage is converted to an estimated $ cost (`estimateCostUsd` / `estimateGeminiCostUsd`) and accumulated onto `Session.llm_cost_usd`. `admin-session-stats` exposes `avg_cost_per_minute_usd` and `total_llm_cost_usd`, surfaced as an admin stat tile. This is an estimate for relative tracking (no volume/batch discounts accounted for) — don't expect it to match the Anthropic/Google invoice to the cent, and historical sessions from before this was built have no recorded cost.

**Result**: real sessions now run at roughly **3¢/min**, down from the original $0.0667/min, with node-classification quality confirmed good (not just cheaper) via real-session review.

---

## 10. Node Taxonomy & Classification Pipeline

### Node types

| Type | Meaning | Color direction | Lifecycle |
|---|---|---|---|
| Topic | Introduces/names a subject or section — a natural parent for the ideas/questions/risks under it | Teal | Static once created |
| Idea | A proposal, suggestion, or possibility raised | Lavender | Static once created |
| Question | Something raised but not yet answered | Amber, **dashed border while open** | Open → Resolved (solid border once answered) |
| Decision | A commitment being made *right now* — a live choice ("let's ship Friday"), not a recap of something already done — see Update below | Sky blue | Static once created |
| Risk | A concern, blocker, or potential problem | Coral | Open → Resolved (dashed while open, same pattern as Question) |
| Action | A task or follow-up, with an owner if known | Gold | Open → Done |
| Plan | A multi-step forward-looking goal/strategy — bigger than a single Action (one task), more concrete than a Topic (which just frames a subject). Actions/ideas can attach under a plan. | Plum | Static once created |
| Evidence | A stated, objective, verifiable fact or data point being used to support/refute/resolve a specific claim, decision, risk, or question elsewhere in the map. Always has a clear parent it's backing up — see Fact for a data point that isn't. | Mint | Static once created |
| Fact | A standalone verifiable data point or background info mentioned in passing, with no argumentative role — not backing up/resolving anything (yet). If it later gets *used* to support something, that later use is Evidence. | Sage | Static once created |
| Opinion | A subjective view, preference, judgment, or reaction — distinct from Evidence's verifiability | Pink | Static once created |
| Update | A report that something was recently changed/fixed/added/updated, logged on its own — distinct from Decision (a live commitment) and Evidence (backs up some *other* node). Added 2026-07-25 after a real session where two "we made changes to X" reports got silently absorbed into an unrelated node instead of getting their own — see [FINDINGS.md §10](FINDINGS.md#10-new-update-node-type-2026-07-25). | Azure | Static once created |
| Waffle | A tangential or personal remark with some real content, but no analytical weight — not the same as true filler | Muted gray, visually recedes | Static once created |

Color always encodes type, never sequence. This set is stable now, but tune further after real usage rather than treating it as gospel.

**Waffle vs. skip entirely:** true filler ("um," "okay," "let's see") is dropped by Tier 1 — Waffle is for utterances that have *some* content or reaction worth keeping even though they're off-topic or personal, not a catch-all for every stray sound. If you can't write even a one-sentence summary beyond the title, that's a sign it's skip, not Waffle.

**Fact vs. Evidence — the easiest of these to get subtly wrong:** both are "a verifiable data point," but Fact has no argumentative role (background info, a number mentioned in passing) while Evidence is specifically doing work — backing up, refuting, or resolving a claim/decision/risk/question elsewhere on the map. The SAME number can be either depending on role: "we're starting at $3.33" is a Fact (nothing to back up yet); "we ended at $3.57, so it cost $0.24" is Evidence (now it's answering a cost question). Judge by role in the conversation, not by the number itself.

**Plan vs. Idea/Topic/Action:** a Plan is a multi-step forward-looking goal, distinct from Topic (frames a subject, no goal), Decision (a single live commitment), and Action (a single task). "Get token cost down to 10¢/6min via batching + dedup" is a Plan; "batch the utterances" and "dedup restated facts" are Actions that would attach under it. A single conceptual suggestion with no steps/target is Idea, not Plan.

**Decision vs. Update:** a status report ("we fixed the joining bug", "we made changes to T1 classification") is Update, not Decision — Decision is for a live commitment being made right now, not a recap of already-completed work.

**Anti-fragmentation rules** (prompt-level, `TIER1_SYSTEM` in `process-session/entry.ts`), grounded in real over-fragmented sessions rather than guessed:
- **REFINEMENT** — a fact/number getting corrected in conversation (e.g. a cost estimate stated three times, each more precise) should expand the existing node, not spawn a new one contradicting/answering the old one.
- **SINGLE RAMBLING REACTION** — one continuous sentiment expressed across many clauses is one node, not one per clause.
- **OVER-EXPANDING / umbrella node** — an existing broad or overview node is never a reason to fold a new, distinct, already-live-guessed fact into its summary via "expand." Prefer "new" + a connecting edge when an utterance carries real distinct content that already has its own live guess showing, even if it's related to an existing node — a node appearing and then vanishing reads as broken. Genuine filler and genuine same-fact refinement are unaffected by this rule.
- **TRAILING CLAUSE** — an utterance ending on a clause that already signals a type ("I have a plan to...", "the risk here is that...") gets its own placeholder node of that type immediately; the utterance that completes it must `expand` that specific node, not attach elsewhere or get folded into something else.
- **Independent-branch bias** — "also" / "one more thing" / "I think we should also" signal a continuation to connect, not a hard pivot; reserve an independent root branch for an explicit "switching gears" moment, since every independent root stacks in the same leftmost layout column and a late related aside would otherwise visually read as belonging with the very start of the session.

The granularity behavior for genuinely DISTINCT enumerated items ("we have two ideas: A and B") is untouched by any of the above — these rules only target restatement/refinement/over-fragmentation, not real enumeration. Full incident write-ups and verification for each rule above: [FINDINGS.md §7](FINDINGS.md#7-live-classification-feel-flicker-vanishing-nodes-fact-squashing-2026-07-25), [§8](FINDINGS.md#8-trailing-clause-bug--a-plan-node-that-never-registered-2026-07-25), [§9](FINDINGS.md#9-umbrella-node-over-folding-tier-1--parent-merged-into-its-own-child-tier-2-2026-07-25).

**Tier 2 merge guard**: independent of prompt instructions, `consolidate-session/entry.ts`'s merge-application loop unconditionally skips any proposed merge pair that's already connected as parent/child in the tree — a hard code-level guard, since a prompt instruction alone can't guarantee a smaller/faster model never proposes it (see FINDINGS.md §9).

### Classification pipeline — two tiers

**Tier 1 (fast path, runs on every utterance):** Streaming transcription with pause/endpoint detection marks an utterance "finalized" the moment someone stops talking. That text goes to a small, fast model call that classifies it, checks it against a short list of currently-open nodes in the session (not the whole graph) to decide new/attach/expand, and returns a confidence score. Target latency: under 1 second.

**Tier 2 (slow path, periodic):** Every N utterances or on a timer, a heavier pass re-checks placements Tier 1 was unsure about, proposes consolidations/restructures ("these two nodes are really the same idea"), and surfaces open questions worth flagging to the user.

**Relation vocabulary**: `leads_to` / `expands` / `answers` / `supports` / `contradicts` / `causes` / `blocks` / `addresses` / `relates_to`. `addresses` was added as the risk-equivalent of `answers` for a question, after a real gap where a risk being addressed was falling back to `contradicts` (confusingly). Both `EdgeLayer.jsx` and `NodeDetailPanel.jsx`'s label maps must stay in sync with the schema enum and the Tier 1/Tier 2 prompts — a past drift here left `NodeDetailPanel.jsx` silently rendering `undefined` for relations it didn't know about.

### Node matching (same-session only)

When a new candidate node is identified, it's checked against the small list of currently-open nodes in *this* session — no embeddings or vector search needed, since that list is short enough to pass directly to the LLM as context. Tier 1 gets a real three-way choice: attach to an existing node, become a child of one (`leads_to`/`answers`/`blocks`/`expands`), or start a genuinely independent branch with no parent at all — a session can have more than one root-level thread. Reach for independent when the speaker signals unrelatedness ("a separate idea," "switching topics") or when there's honestly no contextual link, rather than defaulting every ambiguous case to "attach to the most recent node" (that blind fallback force-connects things that should stand alone).

Tier 1 needs a sliding window of the last 2-3 utterances as context, not just the current one in isolation — otherwise a thought that continues across a pause gets misread as two unrelated statements instead of one connected thought.

### Provisional nodes (staged classification)

A node forms in three stages, and it's the same node record the whole way through — update its fields in place, never delete-and-recreate, so position/connections/animations stay stable:
1. **Instant raw-text placeholder, no LLM call.** The moment partial (non-final) transcript text exists, show it as-is in a dashed "forming" state.
2. **A debounced rough guess** — once partial text is reasonably stable, one lightweight Haiku/Gemini call gives a rough type + title, still dashed. Fires **once per forming node** (not on every debounce tick — see §9). If this guess crosses a high confidence bar (~90%), settle it visually early rather than waiting on an arbitrary STT turn boundary.
3. **Final classification on end_of_turn** — the full Tier 1 pass always runs regardless of whether stage 2 already settled it early; an early-confident guess is a UX head start, not a skip.

Nodes support a manual position override (nullable `pos_x`/`pos_y`) — null means "use the tree auto-layout," set means "the person dragged this, respect it." Connector lines recalculate live off whatever the node's current position actually is.

Below a confidence threshold on any of these three choices, don't auto-place — flag it for the user to confirm.

### Realtime delivery — ops log, not full-state updates

This is the mechanism that makes the board feel alive as you speak — get this wrong and nodes appear to vanish or the whole board feels like it's re-rendering on every utterance instead of growing.

- The moment Tier 1 finishes classifying one utterance (or one batch — see §9), it produces zero or more small discrete operations: `create_node`, `attach_node`, `create_edge`, `update_status`.
- Each op gets appended to an ops log for that session with an incrementing sequence number, and pushed to the frontend via Base44 realtime the instant it's created.
- The frontend applies each incoming op directly to its existing in-memory board state — it never re-fetches or regenerates the whole board. A full render only happens once, on initial page load (replay the session's ops in order).
- Stored as its own append-only collection (`session_ops`), separate from the `nodes`/`node_edges` tables those ops describe — the log is the source of truth for "what happened and in what order," the tables are the current derived state.
- Utterance processing is concurrent, not strictly serial — a classification call fires as soon as its utterance finalizes, without waiting on the previous call. What stays ordered is the commit step (writing the op, determining "current most-recent node" for fallback parenting) so two calls in flight don't both parent off stale state.

### Fallback

If live Tier-1 placement isn't holding up reliably, batch-process the full transcript after the session ends instead. Same pipeline, just not streaming — this is the safety net, not a separate system.

---

## 11. Data Model

- **users** — id, email, name, role (user / admin), org_id, plan_id, stripe_customer_id, stripe_subscription_id, created_at
- **orgs** — id, name, plan_id, seats_used
- **plans** — id, name, price_monthly, node_limit, session_limit, features[], stripe_price_id (see §8)
- **sessions** — id, owner_user_id, org_id, type (personal / meeting), capture_source (mic_live / bot_live / import), title, meeting_url, bot_id, status (active / processing / complete), started_at, ended_at, billed_ms, llm_cost_usd, rating (1-5, nullable), rating_feedback (optional, currently unused by UI)
- **app_config** — singleton row, admin-editable via `/admin/config`. `waitlist_mode` (bool) — when on, onboarding shows a "still building this, free for now" note. RLS: public read, admin-only write.
- **utterances** — id, session_id, speaker_label, text, start_ms, end_ms, finalized
- **nodes** — id, owner_user_id, session_id, type, title, summary, status (open / resolved / done / n-a), hidden (bool, board-visibility toggle, separate from status), provisional (bool, true while still forming), confidence, pos_x, pos_y (nullable — manual drag override), created_at, updated_at
- **node_utterance_links** — node_id, utterance_id (raw-transcript backlink)
- **node_edges** — id, from_node_id, to_node_id, relation (see §10 relation vocabulary)
- **node_notes** — id, node_id, text, created_at
- **session_ops** — id, session_id, seq, op_type (create_node / attach_node / create_edge / update_status / add_note / hide_node), payload (JSON), created_at — the append-only realtime log described in §10
- **usage_events** — id, user_id, org_id, event_type, meta, created_at (feeds admin analytics + plan-limit enforcement)
- **support_tickets** — id, name, email, subject, message, owner_email, status (open / resolved). Public create, admin-only read/update/delete. Triaged from `/admin/tickets` — no auto-reply.
- **calendar_connections** — provider (`google` only), connected_at, auto_join (bool). Owner-scoped RLS. See §7.
- **llm_config** — one row per tier (`t1`/`t2`/`chat`), provider, model, secret_env_var, gemini_cache_name/expires_at/retry_after. Admin-only RLS. See §16.
- **articles** — title, slug, excerpt, content_markdown, cover_image_url, meta_title/meta_description overrides, status (draft/published), published_at, author_name. Public read, admin-only write. See §18.

---

## 12. Pages & Flows

### Marketing
- Landing page (`src/pages/Landing.jsx`) — centered hero, a "how it works" 3-card strip (Talk solo / Join a meeting / Upload a transcript), a scroll-linked reveal paragraph (`ScrollRevealText.jsx`), an FAQ accordion, a TacklyAI preview section (§17), a closing CTA card, and a themed footer (`SiteFooter.jsx`, redesigned — §18) linking Terms/Privacy/Support. `Terms.jsx`/`Privacy.jsx`/`Support.jsx` share the same chrome. SEO: per-page `useDocumentMeta`, `public/robots.txt`, `public/sitemap.xml`.
  - **Hero node marquee** (`HeroNodePopups.jsx`) — a continuous dome-shaped marquee of real `NodeCard`s looping left-to-right along an arc, fading near the headline and brightening clear of it; hovering pauses the loop. Desktop/`lg:` only.
- Support (`src/pages/Support.jsx`, public, `/support`) — themed contact form writing directly to `support_tickets` (RLS allows public create), no backend function needed.
- Articles (`/articles`, `/articles/:slug`) — see §18.

### Auth
- Sign up / log in via a single dynamic, email-first flow (`AuthFlow.jsx`) — email first, branches to login-or-signup based on `check-email-exists`, 6-digit OTP boxes for verification. See [FINDINGS.md §3](FINDINGS.md#3-mobile-touch-fixes--dynamic-email-first-auth-2026-07-24).

### Onboarding
- Shown once per account (localStorage-gated — see the User-entity RLS gotcha in §15 for why not server-side yet), mounted at `AppLayout`. Step 1 "Meet Tackly" (three capture-mode cards); step 2 (waitlist note) only exists when `AppConfig.waitlist_mode` is on. Admins can preview exactly what a new account sees via `/admin/config`.

### Main app
- **Home ("your threads")** — list of past sessions with search, billed duration per card, hover-revealed delete with inline confirm (no native `confirm()`). Deletion is a real client-side cascade across Nodes/Utterances/NodeNotes/SessionOps/NodeEdges then the Session, under owner RLS. A compact usage badge sits under the page heading.
- **New session** — "Start talking" (personal), "Invite the bot" (paste a meeting link), or "Import a transcript."
- **Board view** — the canvas. Live-updating nodes and connectors during capture; a collapsible transcript panel for meeting mode. Tree layout via `d3-hierarchy`, oriented left-to-right: roots stacked vertically if there's more than one independent thread, children fan right, siblings stack in creation order. Soft arched connectors, no arrowheads. Nodes are draggable (`pos_x`/`pos_y` persists); canvas is pannable/zoomable, bounded to content plus padding. Export as PNG, SVG, or Markdown. A "Tackling…" ghost card (`GhostNodeCard.jsx`, with shimmer + real card shadow) renders while a node is being classified. Header buttons (left to right): AI Assistant (§17), Transcript, Export.
- **Node detail panel** — slides in on click: summary, linked transcript excerpts, related nodes, resolve/done controls for Question/Risk/Action, delete/hide. A gold "🗒 n" pill shows note count; "+ Add note" on hover opens `AddNoteModal`. Deleting only hides a node — it doesn't remove the underlying utterance links.
- **Board export** — PNG/SVG (`src/lib/boardExport.js`) mirrors the live board exactly (same connector style, note badges).
- **Search** — keyword search across a user's past sessions and nodes.
- **Settings** — profile; Plan section (real usage + Stripe plan cards, §8); Calendar section (paused, §7).
- Platform compatibility icons (Google Meet / Teams / Zoom / Slack / Webex + Tackly's own mark) shown on the landing page and Home's "Invite the bot" title.

### Admin (role-gated, separate route)
- **Overview** — sessions, meetings captured, average rating, usage-event counts, cost stats (avg $/min, total cost — §9).
- **Users** — searchable table, manual plan assignment (still the override path alongside real Stripe checkout, §8).
- **Plans** (`/admin/plans`) — plan definitions + Stripe Price id + marketing perks editor.
- **Emails** — preview Resend-based transactional templates with sample data.
- **Config** — app-wide settings; waitlist-mode toggle + onboarding preview; LLM provider config (§16).
- **Tickets** (`/admin/tickets`) — support tickets, open/resolved toggle, no auto-reply.
- **Articles** (`/admin/articles`) — see §18.

---

## 13. Design Direction

Reference points: Letterly (crisp white, near-monochrome, one dark accent) and Cluely (bold, high-contrast, single loud accent) — both share extreme restraint in the chrome, letting whitespace and typography carry the interface. That's the register the shell sits in; the post-it nodes remain the one place personality lives.

- **Color** — crisp white base, near-black text, a single bold saturated brand accent used sparingly for primary actions and the logo, kept separate from the node palette.
- **Type** — a clean, confident sans for headers, paired with a neutral sibling for body copy, reading premium rather than twee.
- **Layout** — canvas-first. Thin, minimal top bar. The board fills the viewport; transcript and node-detail panels slide in rather than living in a permanent fixed column.
- **Signature element** — nodes styled as Neubrutalist post-it notes: solid pastel fill, thick black border, hard-edged offset shadow (not a soft blur), bold sans type, a few degrees of random rotation per card so they feel placed rather than machine-gridded.
- **Motion** — nodes pop in with a snappy, bouncy scale-up when created live. Connectors animate in when a connection forms. Live transcript utterances float upward gently before dismissing. A visible "listening" indicator while the mic is held.
- **Landing page** — bold headline, generous whitespace, minimal nav, real `NodeCard`s scattered around the hero.

---

## 14. Phased Build Plan

Phases, not literal calendar days — build and review each before moving to the next.

- **Phase 1 — Foundation.** `npx base44 create`, auth, full data model, design tokens, basic app shell.
- **Phase 2 — Import + classify.** Transcript paste/upload flow, Tier-1 classification function, same-session node matching, board canvas rendering.
- **Phase 3 — Linking + detail.** Connector rendering, node detail panel, Tier-2 consolidation, resolve/done toggling.
- **Phase 4 — Live capture (personal + meeting).** Hold-to-talk (AssemblyAI) + "Invite the bot" (Recall) feeding the same real-time pipeline, plus keyword search.
- **Phase 5 — Admin + billing + polish.** Admin dashboard, billing wiring, full design polish, landing page.
- **Phase 6 — Demo prep.** Demo video, docs/README, bug bash, submission buffer.

All six phases are complete — see §2. Post-launch work (§3, and FINDINGS.md) has continued past this original plan.

---

## 15. Open Questions

- ~~Plan/pricing tiers~~ — **resolved**: Free (30 min/mo, personal + meetings), Plus (£10/mo, 300 min), Pro (£18/mo, 1000 min). Minutes = span of utterance timestamps, same formula for every capture source (`base44/shared/billing.ts`).
- ~~Stripe checkout/webhook~~ — **resolved**, see §8.
- **Resend — minimally built.** Only the welcome email is actually wired to a trigger (fires client-side right after signup OTP verification, best-effort/fire-and-forget — there's no Base44 lifecycle hook for "user created" to hang this off server-side instead). quota-warning and plan-upgraded templates exist but aren't triggered by anything yet.
- **Onboarding "seen" state is still localStorage-only, not persisted server-side** — a user onboarding on a second device sees it again. Fixing this properly means writing a flag onto the user's own `User` record via a dedicated backend function, since `User`'s custom RLS (added for admin plan-assignment) only grants admin read/update, not self-access.
- **Support tickets have no auto-reply and no email notification to admins when one arrives** — an admin has to remember to check `/admin/tickets`. Worth a Resend-triggered "new ticket" admin notification if volume ever justifies it.
- **Thread deletion is a real cascade across five entities from the browser, not a backend function** — fine at today's per-user data volumes, but worth moving to a service-role backend function if a thread ever has thousands of nodes/utterances.
- **A hidden node's eligibility for re-attachment** — should Tier 1 be able to re-attach new utterances to a node the user has deliberately hidden? Default recommendation is no; confirm rather than assume if this comes up.
- **`check-email-exists` is a deliberately minimal email-enumeration surface** — unauthenticated, callable by anyone, returns only `{exists: true|false}`. No rate limiting added (nothing else in the auth surface has any either); worth revisiting if abuse shows up in logs.
- **Gemini classification-quality gap vs. Haiku** — not fully resolved, see [FINDINGS.md §4](FINDINGS.md#4-configurable-per-tier-llm-provider--activation-log-2026-07-24). Flagged for a decision on a Gemini-specific prompt tuning pass vs. accepting the tradeoff for cost.
- **Calendar auto-join doesn't yet produce a board** — see the known gap in §7.

---

## 16. Configurable Per-Tier LLM Provider

Tier 1 (`process-session`), Tier 2 (`consolidate-session`), and TacklyAI chat (`ask-tackly-ai`) can each be pointed at a different provider/model from **Admin > Config > "LLM models"**, without a code deploy. Full activation history and a real production incident are in [FINDINGS.md §4](FINDINGS.md#4-configurable-per-tier-llm-provider--activation-log-2026-07-24).

- `LlmConfig` entity (admin-only RLS): one row per tier (`t1`/`t2`/`chat`) holding `provider` (`anthropic` | `google`), `model` (exact API model-id string), and `secret_env_var` (the *name* of a Deno secret, never the key value — set via `npx base44 secrets set` from the terminal, outside this app entirely).
- `admin-set-llm-config`: admin-gated, fires **one real test call** against the given provider/model/secret before writing anything. A failing test leaves the tier on whatever it was running before — a row only activates once it passes.
- `shared/llm.ts`'s `classifyForTier` is the single call site all three tiers use. It reads the tier's `LlmConfig` row fresh on **every call** (no caching) — a change saved in Admin takes effect on the very next live utterance/session, no redeploy. No row for a tier falls back to the hardcoded Anthropic Haiku call, so this feature can never make a tier's live behavior worse, only optionally different once verified.
- `shared/gemini.ts`: direct Google Gemini `generateContent` calls with forced function-calling. Explicit prompt caching via `cachedContents` (1hr TTL, ~$1/MTok/hour storage fee, trivial at this prompt's size) — the closest Gemini equivalent to Anthropic's `cache_control`. **Fails soft by design**: any cache problem falls back to a plain uncached call, with a 15-minute retry cooldown (`gemini_cache_retry_after`) after a failure so a permanently-failing cache attempt (e.g. a prompt below Gemini's minimum cacheable size, or a quota block) doesn't double every call's request volume.
- Cost tracking stays normalized regardless of provider — `classifyForTier` returns a `costUsd` computed from whichever pricing table matches the active provider.
- **Currently live**: T1, T2, and chat are all configured on `gemini-3.5-flash-lite` via `GOOGLE_T1T2_SECRET`.

---

## 17. TacklyAI — Board Assistant

A chat button in the board header opens a scoped Q&A assistant that can only see and answer from that ONE session's own nodes — never cross-session, never account-wide history. Build/redesign history: [FINDINGS.md §5](FINDINGS.md#5-tacklyai--build-rounds--verification-2026-07-24--2026-07-25).

- **`ask-tackly-ai` function** — auth-gated, resolves the session via the caller's own RLS (a foreign session 404s, same pattern as `process-session`), pulls the session's visible (non-hidden, non-provisional) nodes as context, answers via a forced tool call (`answer_question` → `{answer: string}`). **Not plan-gated** — free on every tier by design.
- **Reuses the T1/T2 provider infrastructure** — `classifyForTier`'s tier type includes `"chat"`, sharing the same test-before-activate Save & Test flow and fallback-to-Haiku safety. The system prompt is entirely static (persona/instructions only); all per-session board content and conversation history live in the USER message, so caching is never conflated across different users' boards.
- **Nothing is persisted** — no `ChatMessage` entity, no DB writes. The client (`TacklyAIPanel.jsx`) keeps the conversation in component state only, resending the last 40 messages as `history` per call — multi-turn context works within a visit, but it's gone the moment the panel unmounts.
- **UI**: "AI Assistant" button first in the board header row, plus a second entry point from the "This thread has been tackled" dead-end bar — both open the same shared panel (`assistantOpen` state lifted to `Board.jsx`). Bubbles animate in with the same spring/overshoot arrival used for live transcript bubbles; assistant replies type out character-by-character (`StreamingText`) as a stand-in for real token streaming. Landing page has its own cycling preview (`TacklyAIPreview.jsx`).
- **Currently live on Gemini** (`gemini-3.5-flash-lite` via `GOOGLE_T1T2_SECRET`, same as T1/T2), ~$0.0003/question.

---

## 18. Articles/Blog + SEO

Full investigation notes (sitemap indexing check, verification detail): [FINDINGS.md §6](FINDINGS.md#6-articlesblog-footer--closing-cta-redesign-seo-polish-2026-07-25).

- **Database-backed, not static files — new content goes live with zero deploy.** `Article` entity (`title`, `slug`, `excerpt`, `content_markdown`, `cover_image_url`, `meta_title`/`meta_description` overrides, `status`: draft/published, `published_at`, `author_name`). RLS: admin-only write, public read (draft-vs-published filtering happens at the query level on public pages). Public pages (`/articles`, `/articles/:slug`) fetch directly from the entity at render time.
- **Markdown**: `marked` (parse) + `dompurify` (sanitize before `dangerouslySetInnerHTML`). `src/lib/markdown.js`'s `renderMarkdown()` is shared by the admin editor's live preview and the public article page.
- **Per-article SEO**: `useDocumentMeta` (title/description/og:title/og:description) plus, in `ArticleDetail.jsx`: canonical `<link>` rewritten to the article's real URL, `og:image` when a cover image is provided, and `Article` JSON-LD structured data injected into `<head>`.
- **Admin editor** (`/admin/articles`, `ArticlesPage.jsx`): list + detail pattern. Slug auto-derives from title via `slugify()` until manually touched. Markdown textarea + Preview toggle through the same `renderMarkdown()` the public page uses. Collapsible "Advanced SEO" section for meta overrides. `published_at` set automatically on first publish.
- **Site-wide meta description** rewritten to compete on "AI notetaker" search intent, mirrored across `index.html`, `Landing.jsx`, and `og:`/`twitter:` tags.
- **Footer** (`SiteFooter.jsx`) restructured into a 3-column layout (brand+tagline, Product, Company) + bottom bar, reusing the shared `Logo` component for guaranteed wordmark alignment.
- **Closing CTA** redesigned as a contained neubrutalist card (`rounded-2xl border-2 border-ink shadow-brutal`) instead of a full-bleed color band.
