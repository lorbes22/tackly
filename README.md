# Tackly Architecture & System Plan

**Product Hunt Launch (Top #13):** https://www.producthunt.com/products/tackly

**PLAN.md is the main source of truth for all product, architecture, design, and pipeline specifications.**

Tackly turns spoken or typed thought — a meeting, a rambling voice note, or a solo brainstorm — into a living map of post-it-style nodes instead of a linear transcript. Built on the Base44 backend platform with a React frontend.

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
Tier 1, Tier 2, and TacklyAI can run directly on Anthropic (Claude Haiku 4.5) or Google Gemini 3.5 Flash Light via configurable Deno secrets and runtime settings in Admin.

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
