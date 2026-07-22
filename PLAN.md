# Tackly — build plan

## North star

Tackly turns spoken or typed thought — a meeting, a rambling voice note, a solo brainstorm — into a living map of nodes instead of a linear transcript or summary. Two things make it different from adjacent tools:

1. **Cross-session memory.** When you say something that connects to a thought from a previous session (not just earlier in the current one), Tackly recognizes it and expands the existing node instead of creating a duplicate. This is the core differentiator — most competitors are scoped to a single board/session.
2. **Dual mode.** The same engine works for team meetings (multi-speaker, imported or live transcript) and personal thinking (hold-a-key-to-talk, solo). It's a thinking tool that also happens to handle meetings, not a meeting tool with a personal mode bolted on.

Design feel: Apple-level restraint in the chrome, Letterly-level warmth and approachability, nodes styled like physical post-it notes — playful and tactile without tipping into a kids'-app look. Startupy, not clinical.

v1 scope decision (carried over from planning): meeting capture starts with **paste/import transcript**, not a live bot joining calls. Live capture (personal hold-to-talk, and eventually a meeting bot) is real-time from day one since that's core to the product; auto-joining scheduled calls is a v2 stretch goal, not part of the initial build.

---

## 1. Tech stack & setup

- Backend: Base44 backend platform. First step: `npx base44 create` to provision database, auth, functions, storage, realtime.
- Frontend: web app built on top of the Base44-generated backend, plain routing for two areas — the main app (`/app/...`) and a role-gated admin area (`/admin/...`).
- AI: Claude API calls from Base44 functions for classification, extraction, and consolidation.
- Embeddings: for same-session and cross-session node matching (provider TBD during build — whatever Base44's AI integration exposes most easily; fall back to a standalone embeddings API if needed).
- Speech-to-text: real-time WebSocket transcription for personal hold-to-talk capture from day one. Provider TBD (evaluate what's easiest to wire into a Base44 function first).

---

## 2. Node taxonomy & identification logic

### Node types

| Type | Meaning | Color direction | Lifecycle |
|---|---|---|---|
| Idea | A proposal, suggestion, or possibility raised | Lavender | Static once created |
| Fact | A stated, verifiable piece of information | Mint green | Static once created |
| Question | Something raised but not yet answered | Amber, **dashed border while open** | Open → Resolved (solid border once answered) |
| Decision | Something the group or person has committed to | Sky blue | Static once created |
| Risk | A concern, blocker, or potential problem | Dusty red/coral | Open → Resolved (dashed while open, same pattern as Question) |
| Action | A task or follow-up, with an owner if known | Gold/yellow | Open → Done |

This set can and should get tuned after real usage — it's a starting point, not gospel. Color always encodes type, never sequence.

### Classification pipeline — two tiers

**Tier 1 (fast path, runs on every utterance):**
Streaming transcription with pause/endpoint detection marks an utterance "finalized" the moment someone stops talking. That text goes to a small, fast model call that:
- Classifies it (idea / fact / question / decision / risk / action / none — most utterances are filler and should be skipped)
- Checks it against a short list of currently-open nodes in the session (not the whole graph) to decide: new node, or attach/expand an existing one
- Returns a confidence score

Target latency: under 1 second, so this stays a small model with minimal context, not a full reasoning pass.

**Tier 2 (slow path, periodic):**
Every N utterances or on a timer, a heavier pass:
- Re-checks placements Tier 1 was unsure about (low confidence)
- Runs the cross-session embedding search (see below) to catch connections Tier 1's narrow context missed
- Proposes consolidations/restructures ("these two nodes are really the same idea")
- Surfaces open questions worth flagging to the user

### Node matching (same-session and cross-session)

Every node gets an embedding on creation (title + summary). When a new candidate node is identified:
1. Search embeddings within the current session first (cheap, fast — this is what Tier 1 can realistically do)
2. Tier 2 additionally searches across the user's *entire* node history, not just the current session
3. Top-K matches get passed to the LLM to decide: new node, attach to existing, or expand existing with new detail
4. Below a confidence threshold, don't auto-place — flag it for the user to confirm (mirrors "questions for you" style UX)

Every node also keeps a link to the raw utterance(s) that produced it, so a summary that's too compressed can always be expanded back to the original words.

### Fallback

If live Tier-1 placement isn't holding up reliably by demo time, batch-process the full transcript after the session ends instead. Same pipeline, just not streaming — this should be the safety net, not a separate system.

---

## 3. Data model (Base44 collections)

- **users** — id, email, name, role (user / admin), org_id, plan_id, created_at
- **orgs** — id, name, plan_id, seats_used
- **plans** — id, name, price_monthly, node_limit, session_limit, features[]
- **sessions** — id, owner_user_id, org_id, type (personal / meeting), title, source (live / import), status (active / processing / complete), started_at, ended_at
- **utterances** — id, session_id, speaker_label, text, start_ms, end_ms, finalized
- **nodes** — id, owner_user_id, session_id, type, title, summary, status (open / resolved / done / n-a), confidence, embedding, created_at, updated_at
- **node_utterance_links** — node_id, utterance_id (raw-transcript backlink)
- **node_edges** — id, from_node_id, to_node_id, relation (expands / answers / blocks / relates_to), cross_session (bool)
- **usage_events** — id, user_id, org_id, event_type, meta, created_at (feeds admin analytics + plan-limit enforcement)

---

## 4. Pages & flows

### Marketing
- Landing page — single page: hero, how it works, pricing, sign-up CTA

### Auth
- Sign up / log in (Base44 auth)

### Main app
- **Home ("your threads")** — list of past sessions, personal and meeting mixed or filterable, search bar up top
- **New session** — two entry points: "Start talking" (personal, hold-to-talk) or "Add a meeting" (paste/upload transcript)
- **Board view** — the canvas. Live-updating nodes and connectors during capture; for meeting mode, a collapsible transcript panel alongside (not a fixed permanent column — keep the canvas as the hero, not a dashboard)
- **Node detail panel** — slides in on click: summary, linked transcript excerpts, related nodes (same-session and cross-session), resolve/done controls for Question/Risk/Action
- **Search** — semantic search across all of a user's nodes and sessions
- **Settings** — profile, plan/billing

### Admin (role-gated, separate route)
- **Dashboard home** — signups, active sessions, nodes created, MRR at a glance
- **Users** — searchable table, view detail, change plan, disable account
- **Plans/billing** — manage plan definitions, view subscriptions (Stripe via Base44 integration)

---

## 5. Design direction

Following a proper design pass (color/type/layout/signature), not defaulting to generic templates:

- **Color** — warm off-white paper canvas as the base (not pure white, not the generic cream-plus-terracotta combo), near-black warm gray for text, a single muted periwinkle/indigo as the sparing brand accent for primary actions — kept separate from the node palette so the pastel nodes stay the visual focus, not competing with UI chrome.
- **Type** — a rounded, characterful display face for headers and board titles only (used with restraint — this is where the "childish but startupy" personality lives), paired with a clean neutral sans for everything else (body copy, metadata) so the interface stays Apple-restrained rather than twee throughout.
- **Layout** — canvas-first. Thin, minimal top bar (icons over labels where possible). The board fills the viewport; transcript and node-detail panels slide in rather than living in a permanent fixed column, so the map itself stays the hero the way the reference tool's dashboard-style layout doesn't.
- **Signature element** — the nodes themselves, styled like real post-it notes: solid pastel fill (not white cards with a colored border), a few degrees of random rotation per card so they feel placed rather than machine-gridded, soft close shadow, corners rounded like a trimmed sticky note rather than a bubbly pill.
- **Motion** — nodes pop in with a small satisfying scale-and-fade when created live; connectors draw themselves in gently. Restrained everywhere else — no decoration that doesn't serve the moment of a thought becoming visible.

This direction is a starting point for whoever builds the UI — worth running through a proper brainstorm/critique pass (per the frontend-design process) before locking exact hex values and fonts, rather than treating the above as final.

---

## 6. Phased build plan (6 days, today through July 28)

- **Day 1 — Foundation.** `npx base44 create`, auth, full data model above, design tokens scaffolded into the codebase, basic app shell (routing for main app + admin).
- **Day 2 — Import + classify.** Transcript paste/upload flow, Tier-1 classification function, same-session node matching, board canvas rendering with post-it-style nodes (simple layout algorithm to start).
- **Day 3 — Linking + detail.** Connector rendering between nodes, node detail panel with linked transcript excerpts, Tier-2 consolidation pass, resolve/done toggling for Question/Risk/Action nodes.
- **Day 4 — Personal capture + cross-session.** Hold-to-talk browser capture (mic → streaming STT → Tier-1 pipeline, live), cross-session embedding search so nodes can link across a user's whole history, search page.
- **Day 5 — Admin + billing + polish.** Admin dashboard (users, plans), billing wiring, full design polish pass (post-it aesthetic + motion applied everywhere), landing page.
- **Day 6 — Demo prep.** Demo video, docs/README, bug bash, submission buffer.

---

## 7. Open questions to confirm during build

- Exact STT and embeddings providers — pick whichever wires into a Base44 function with the least friction, confirm on Day 1 before building around it.
- Plan/pricing tiers aren't decided yet — needed before the billing wiring on Day 5.
- Node taxonomy (6 types above) is a first pass — fine to adjust after seeing real sessions mapped.
- Live meeting-bot capture (auto-joining calls) is explicitly out of scope for this build — don't let it creep in before the core dual-mode experience is solid.
