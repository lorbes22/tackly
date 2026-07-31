# Tackly Architecture & System Plan

**Product Hunt Launch (Top #13):** https://www.producthunt.com/products/tackly

**PLAN.md is the main source of truth for all product, architecture, design, and pipeline specifications.**

Tackly turns spoken or typed thought — a meeting, a rambling voice note, or a solo brainstorm — into a living map of post-it-style nodes instead of a linear transcript. Built on the Base44 backend platform with a React frontend.

## Base44 Backend Usage

Base44 isn't just hosting — the app leans directly on nearly every part of the platform:

| Base44 primitive | How Tackly uses it |
|---|---|
| **Entities** (18) | `Session`, `Utterance`, `Node`, `NodeEdge`, `NodeNote`, `SessionOp`, `User`, `Org`, `Plan`, `AppConfig`, `UsageEvent`, `SupportTicket`, `CalendarConnection`, `LlmConfig`, `Article`, `Badge`, `Collaborator` |
| **Functions** (28 Deno serverless functions) | Ingestion (`recall-*`, `assemblyai-token`), classification (`process-session`, `consolidate-session`, `classify-partial`), billing (`stripe-webhook`, `create-checkout-session`, `create-billing-portal-session`, `check-quota`), the board assistant (`ask-tackly-ai`), board sharing (`get-board-access`, `get-shared-board`, `mic-lock`, `invite-collaborator`), auth (`check-email-exists`), email (`send-templated-email`), and a dozen `admin-*` management/telemetry functions |
| **Auth** | Email OTP + Google OAuth, role-gated (`user`/`admin`) via `User.role` |
| **Realtime** | `SessionOp` and `Session` subscriptions drive the entire live board for its owner — no polling for the primary path. A collaborator polls a dedicated gateway function instead, since realtime can't safely extend past its subscriber's own RLS; the public read-only share link is a single one-time fetch with no polling at all, since there's nothing live left once a session has ended — see Hardest Backend Problems below |
| **Row-Level Security (RLS)** | Three tiers used deliberately: owner-scoped (`Session`, `Node`, `Utterance`), admin-only (`LlmConfig`, article/plan writes), and public-read (`Plan`, published `Article`, `AppConfig`). A Base44 security scan caught a real public-create gap across 10 entities, since fixed — see `PLAN.md`/`FINDINGS.md` |
| **Secrets** | 9 Deno secrets (`ASSEMBLYAI_API_KEY`, `RECALL_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_T1T2_SECRET`, etc. — see Environment Secrets below) |
| **CLI-driven dev loop** | `entities push`, `functions deploy`, `secrets set`, and `exec` (for scratch-data verification against production) are the primary workflow — no separate backend infra to provision or manage |

The one deliberate opt-out: LLM calls (Tier 1/Tier 2/chat) bypass Base44's built-in `InvokeLLM`/AI Gateway in favor of direct Anthropic/Gemini calls — `InvokeLLM` has a fixed ~2s latency floor and no prompt-caching or forced-tool-use support, both of which the live classification pipeline depends on. See `PLAN.md` §5 and §17.

## Hardest Backend Problems Solved

- **Real-time delta architecture**: the board never re-fetches or re-renders wholesale. Tier 1/Tier 2 emit an append-only `SessionOp` log (`create_node` / `attach_node` / `create_edge` / `update_status`), delivered over Base44 realtime and applied as individual patches to in-memory canvas state. Utterance classification runs concurrently, but the commit step (writing the op, resolving "current most-recent node") stays strictly ordered so concurrent calls never parent off stale state.
- **Dual ingestion normalization**: personal mic audio (AssemblyAI), meeting-bot audio (Recall), and pasted transcripts all converge into the same `Utterance` shape before Tier 1 ever runs — one classification pipeline serving three structurally different capture sources.
- **Billing safety on AssemblyAI and Recall**: AssemblyAI bills for connection time, not speech time, so hold-to-talk opens a fresh connection per press and sends `Terminate` on release, backed by a hard server-side `max_session_duration_seconds` ceiling in case a client-side close never fires. Recall's bot-based billing is lower-risk by construction, but `automatic_leave` is still configured explicitly rather than left to defaults.
- **Two-tier classification with different cost/latency profiles**: Tier 1 is a sub-second, per-utterance pass with a narrow context window; Tier 2 is a periodic, heavier consolidation pass over the whole graph — sharing one ops-log delivery mechanism despite very different latency budgets. Live capture batches finalized utterances client-side before Tier 1's authoritative call (`BATCH_DEBOUNCE_MS`, 700ms as of 2026-07-30, down from an original 2500ms that was pure cost-batching overhead unrelated to model speed — see `FINDINGS.md` §20).
- **Configurable multi-provider LLM routing**: an admin-editable `LlmConfig` entity plus a test-before-activate function (`admin-set-llm-config`) let Tier 1/Tier 2/chat each point at Anthropic or Gemini independently, re-read fresh on every call with no redeploy — and a failing test-call can never take down a tier that was already working.
- **Webhook reliability under real-world conditions**: a Recall webhook silently 404ing because a Base44 function's internal dispatcher URL isn't public, and an uncaught signature-verification exception 500ing every delivery, were both found only through live meeting testing against actual function logs — not something code review alone surfaced.
- **Cross-user access control without reopening RLS**: board sharing (collaborators) needs a non-owner to see someone else's board, but Base44 RLS can't express a cross-entity check ("does a grant row exist"). Solved with a single service-role gateway function that resolves owner/editor and returns a snapshot — the only place a non-owner ever touches another user's data — polled on an interval rather than subscribed to, since realtime only ever runs within the subscriber's own RLS.
- **A second, deliberately separate access model for the public share link**: an authenticated collaborator and an anonymous "anyone with the link" visitor are two fundamentally different trust models, so they get two different functions rather than one function branching on "is there a user or not." The public link is keyed purely by an unguessable token (never a session id), gated to ended sessions on creation, and instantly killable via a revoke flag — see `PLAN.md` §20.
- **A real-time regression caused by conflating two different "not the owner" cases**: a fallback path meant for genuine non-owners could also fire on a plain transient load failure for the *actual* owner — and since a gateway function correctly resolves the true owner as "owner" regardless of which code path called it, that failure silently and permanently downgraded the owner into polling + wholesale-state-replacement instead of realtime. Live long enough to force a production rollback before the exact conflation was found and fixed — full incident write-up in `FINDINGS.md`. Directly shaped the next decision below: never let a reveal/animation effect touch the render loop on a timer again.
- **A staggered "replay" reveal that can't repeat that regression**: nodes/edges on a fresh board load now pop in one by one in creation order instead of all at once, on both the owner's board and the public share link. Implemented as pure `animation-delay` values computed once from the already-fetched data — nothing here re-triggers layout or grows the rendered set over time, unlike a timer-driven reveal would.
- **Cost per minute reduced from ~$0.0667/min → ~$0.03/min**: via Tier-2 frequency/model changes, `openList` windowing, a filler pre-filter, live-utterance batching, and real per-session cost tracking that didn't exist before any of this work started.

Full write-ups for all of the above live in `PLAN.md` and `FINDINGS.md`.

## Repository Structure

```text
base44/                       # Backend configuration & serverless code
├── config.jsonc              # Project settings & Base44 runtime options
├── shared/                   # Shared backend utils (Claude, Gemini, Stripe, Email)
├── entities/                 # Data schemas (Session, Utterance, Node, NodeEdge, SessionOp, Plan...)
└── functions/                # Deno backend functions
    ├── process-session/      # Tier-1 classification pass
    ├── consolidate-session/  # Tier-2 pass (graph consolidation)
    ├── ask-tackly-ai/        # Board-scoped AI Q&A assistant
    ├── classify-partial/     # Live rough guess on in-progress speech
    ├── recall-webhook/       # Ingests Recall meeting streaming webhooks
    ├── recall-start-bot/     # Deploys Recall bot to meeting link
    ├── stripe-webhook/       # Manages subscription state changes
    ├── get-board-access/     # Gateway for an authenticated collaborator's board access
    ├── get-shared-board/     # Public, unauthenticated read-only board access (share link)
    ├── mic-lock/             # One-speaker-at-a-time claim/release for Collaborate
    ├── invite-collaborator/  # Owner-only board share invite (email + cap enforcement)
    └── admin-*/              # System management & telemetry functions

src/                          # Frontend (Vite + React)
├── pages/                    # Landing, Auth, App Canvas, Search, Admin, Articles
├── components/               # NodeCard, EdgeLayer, LiveBars, TacklyAIPanel, Modals
└── lib/                      # AuthContext, useHoldToTalk, boardExport, markdown
```

## Overall Architecture

Tackly uses a **dual-mode ingestion engine** feeding a unified real-time classification pipeline. Whether capturing solo audio, meeting audio, or imported text, all inputs convert to normalized `Utterance` rows before entering the Tier 1 classification model.

```text
[ Ingestion Sources ]               [ Pipeline Processing ]              [ Derived Graph State ]

 Personal Mic Audio                  Tier 1 Classifier
 (AssemblyAI Stream)   ────────┐    (Haiku 4.5 / Gemini Flash)
                               │    -  Real-time classification
 Meeting Bot           ────────┼──> -  Delta ops generation      ──────>  SessionOps (Realtime Log)
 (Recall Streaming)            │    -  Per-utterance placement
                               │                                                  │
 Imported Transcript   ────────┘    Tier 2 Consolidation                          ▼
 (Parsed Text/File)                 (Periodic / End-of-session)           Frontend Board Canvas
                                    -  Merges & connector edges            -  Neubrutalist Nodes
                                                                          -  d3-hierarchy Layout
```

## Key Architectural Concepts

### Dual Capture Modes
Solo capture streams browser mic audio through the AssemblyAI SDK with ephemeral hold-to-talk connections for billing safety. Meeting capture deploys a Recall bot to call URLs (Google Meet/Teams/Zoom) which streams real-time transcript webhooks.

### Two-Tier LLM Classification Pipeline
- Tier 1 (Sub-second / Real-time): Classifies utterances as they finalize into structured node types:
  - Topic
  - Idea
  - Question
  - Decision
  - Risk
  - Action
  - Plan
  - Evidence
  - Fact
  - Opinion
  - Update
  - Waffle
- Tier 1 emits append-only delta operations (`SessionOp`).
- Tier 2 (Periodic / Wrap-up): Performs periodic passes over the node graph to execute merges, infer cross-branch connections, and restructure relationships.

### Smart Connectors
Tackly uses **soft arched connector paths** to visually link nodes based on inferred relationships inside the session graph. These connectors are driven by the same node-edge model used by the board, with relation types such as `leadsto`, `expands`, `answers`, `supports`, `contradicts`, `causes`, `blocks`, `addresses`, and `relatesto`.

Connectors update live as nodes are attached, expanded, moved, or consolidated, so the graph always reflects the current layout rather than a static draft. When a node expands an existing idea or a dragged node changes position, its connector recalculates from the latest board state instead of snapping to a fixed placeholder.

### Delta-Based Operations Log
The frontend subscribes to `SessionOp` realtime changes rather than re-fetching the entire board, applying granular ops (`create_node`, `attach_node`, `create_edge`, `update_status`) directly to in-memory canvas state.

### Flexible Model Providers
Tier 1, Tier 2, and TacklyAI can run directly on Anthropic (Claude Haiku 4.5) or Google Gemini 3.5 Flash Light via configurable Deno secrets and runtime settings in Admin. Gemini's path supports explicit prompt caching (`cachedContents`) but it's disabled by default (opt-in, not opt-out) — live testing found Google's cache-serving endpoint itself to be intermittently slow/unreliable, independent of Gemini's actual (fast, reliable) model calls. See `PLAN.md` §17 and `FINDINGS.md` §17-18 for the full story, including a real, previously-silent request-shape bug that had been masking this.

### Billing & Quota Management
Subscription limits are tracked via session duration (`billed_ms`) using direct Stripe Checkout integration and webhook lifecycle management.

## Backend Deployment

```bash
npx base44 entities push    # Push schema changes to database
npx base44 functions deploy  # Deploy backend serverless functions
```

## Environment Secrets

Set runtime backend keys via Base44 secrets:

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

`RECALL_VERIF_SECRET` is required to verify Recall webhook deliveries. `GOOGLE_T1T2_SECRET` supports the configurable Tier 1 / Tier 2 / chat LLM provider setup, alongside the provider-specific API keys. `RESEND_API_KEY` powers themed transactional emails (welcome, quota-warning, plan-upgraded). `GOOGLE_CALENDER_CLIENT_ID` (note the spelling — that's the actual secret name in Base44) is the Google OAuth client id for the paused Calendar integration. `RECALL_REGION` is optional and defaults to `eu-central-1` in code if unset.

## Source Of Truth

For full architectural details, model prompt specs, node taxonomy definitions, billing safety mechanisms, and phase roadmaps, refer to `PLAN.md`. Detailed dated investigation notes (bugs found, root causes, fixes) live in `FINDINGS.md`.
