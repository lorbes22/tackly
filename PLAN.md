# Tackly — build plan

## North star

Tackly turns spoken or typed thought — a meeting, a rambling voice note, a solo brainstorm — into a living map of nodes instead of a linear transcript or summary. What makes it different from adjacent tools: **dual mode.** The same engine works for team meetings (multi-speaker, imported or live transcript) and personal thinking (hold-a-key-to-talk, solo). It's a thinking tool that also happens to handle meetings, not a meeting tool with a personal mode bolted on.

Scope note: cross-session memory (recognizing when a new thought connects to something from a *previous* session, not just earlier in the current one) was considered and cut for this build — matching happens within a session only. Worth knowing if this gets revisited later, since it was the sharpest differentiator from tools scoped the same way (single board/session) — but not needed to ship something genuinely good now.

Design feel: Apple-level restraint in the chrome, Letterly-level warmth and approachability, nodes styled like physical post-it notes — playful and tactile without tipping into a kids'-app look. Startupy, not clinical.

v1 scope decision (updated): meeting capture is live from the start, via Recall (a meeting-bot API) — paste/import transcript remains as a secondary path for meetings already recorded elsewhere, not the only option. Both personal hold-to-talk and meeting-bot capture feed the same real-time utterance pipeline; the pipeline itself doesn't care whether an utterance came from a browser mic or a bot in a call.

---

## 1. Tech stack & setup

- Backend: Base44 backend platform. First step: `npx base44 create` to provision database, auth, functions, storage, realtime.
- Frontend: web app built on top of the Base44-generated backend, plain routing for two areas — the main app (`/app/...`) and a role-gated admin area (`/admin/...`).
- AI: direct Anthropic API calls, not Base44's built-in `InvokeLLM` — switched after measurement showed `InvokeLLM` has a fixed ~2s floor with no model parameter exposed, which conflicts directly with Tier 1's sub-1-second target. Confirmed side benefit, per Base44's own docs: integration credits are only charged for Base44's built-in services (InvokeLLM included) — calls made via your own API key don't touch that pool at all, so this switch also fully removes Tier 1/Tier 2 from Base44's credit usage, not just speeds them up. Tier 1 (per-utterance classification) uses `claude-haiku-4-5-20251001` — fast, and well-suited to a small, well-defined task like this. Tier 2 (periodic consolidation) uses `claude-sonnet-5` — no tight latency budget here, and the deeper reasoning is worth the extra time. Use prompt caching on Tier 1's system prompt (node taxonomy, output format, instructions) since it's static across every call and Tier 1 runs on every single utterance — this compounds with the model-choice fix.
- Node matching is same-session only and runs directly off the small list of currently-open nodes in the LLM call — no embeddings or vector search needed.
- Speech-to-text, personal mode: browser mic → streaming STT via AssemblyAI, model `universal-3-5-pro` (realtime), via the official AssemblyAI SDK — not raw WebSocket, since the SDK handles session termination correctly and that's the specific mechanism that causes overcharges if hand-rolled. Decided for transcription quality since it directly feeds the classification pipeline; cost difference vs. the cheaper base streaming model is trivial at this scale and covered by free signup credit either way. See `docs/assemblyai-agent-instructions.md` for the exact integration pattern. Don't let model choice or SDK-vs-raw-WebSocket get re-litigated in Phase 4, just build against it.
  - **Billing safety (important, build this in from the start, not as an afterthought):** AssemblyAI bills for connection time, not actual speech time — a session left open costs the same whether the user is talking or silent. So "hold to talk" must open a fresh connection when the key is pressed and send `Terminate` the moment it's released, not one long-lived connection muted between presses. Layer in a short `max_session_duration_seconds` (e.g. 600s) when minting the token, well below the 3-hour default cap, as a hard server-side ceiling in case a client-side close ever fails to fire (crash, dropped network, force-quit).
- Speech-to-text + capture, meeting mode: Recall (meeting-bot API). A bot joins the meeting via a pasted call link, and Recall streams real-time transcript events to a webhook endpoint in a Base44 function. Recall's realtime events and AssemblyAI's personal-mode Turn events both resolve to the same shape (speaker, text, finalized) before hitting the Tier-1 classifier — one ingestion function, two sources. Set `automatic_leave` explicitly on bot creation (silence detection, bot-only detection, waiting room timeout) rather than relying silently on Recall's defaults — same values are fine, just make them visible in the code rather than implicit.
  - **Billing safety:** lower risk here by design — Recall's bots leave automatically within seconds of every human participant leaving the call, plus built-in timeouts for an empty waiting room or nobody ever joining. Defaults are sensible; no extra cap needed on top, unlike personal mode above.

**Secrets needed** (set via `npx base44 secrets set KEY=value`, never pasted in chat):
- `RECALL_API_KEY` — meeting bot capture
- `ASSEMBLYAI_API_KEY` — personal hold-to-talk capture
- `ANTHROPIC_API_KEY` — direct Claude calls for Tier 1/Tier 2 classification, replacing Base44's built-in LLM

---

## 2. Node taxonomy & identification logic

### Node types

| Type | Meaning | Color direction | Lifecycle |
|---|---|---|---|
| Idea | A proposal, suggestion, or possibility raised | Lavender | Static once created |
| Fact | A stated, verifiable piece of information | Mint green | Static once created |
| Opinion | A subjective view, preference, or reaction — distinct from Fact's verifiable claim | Pink | Static once created |
| Question | Something raised but not yet answered | Amber, **dashed border while open** | Open → Resolved (solid border once answered) |
| Decision | Something the group or person has committed to | Sky blue | Static once created |
| Risk | A concern, blocker, or potential problem | Dusty red/coral | Open → Resolved (dashed while open, same pattern as Question) |
| Action | A task or follow-up, with an owner if known | Gold/yellow | Open → Done |
| Aside | A tangential or personal remark with some real content, but no analytical weight — not the same as true filler | Neutral gray, visually muted/recedes | Static once created |

This set can and should get tuned after real usage — it's a starting point, not gospel. Color always encodes type, never sequence.

**Aside vs. skip entirely:** true filler ("um," "okay," "let's see") should still be dropped by Tier 1, same as before — Aside is for utterances that have *some* content or reaction worth keeping even though they're off-topic or personal, not a catch-all for every stray sound. The classification prompt needs explicit guidance distinguishing these three buckets (analytical type / Aside / skip), not just two.

### Classification pipeline — two tiers

**Tier 1 (fast path, runs on every utterance):**
Streaming transcription with pause/endpoint detection marks an utterance "finalized" the moment someone stops talking. That text goes to a small, fast model call that:
- Classifies it (idea / fact / opinion / question / decision / risk / action / aside / none — true filler should still be skipped; see the Aside-vs-skip distinction above)
- Checks it against a short list of currently-open nodes in the session (not the whole graph) to decide: new node, or attach/expand an existing one
- Returns a confidence score

Target latency: under 1 second, so this stays a small model with minimal context, not a full reasoning pass.

**Tier 2 (slow path, periodic):**
Every N utterances or on a timer, a heavier pass:
- Re-checks placements Tier 1 was unsure about (low confidence)
- Proposes consolidations/restructures ("these two nodes are really the same idea")
- Surfaces open questions worth flagging to the user

### Node matching (same-session only)

When a new candidate node is identified, it's checked against the small list of currently-open nodes in *this* session — no embeddings or vector search needed, since that list is short enough to pass directly to the LLM as context:
1. The LLM decides: new node, attach to an existing one, or expand an existing one with new detail
2. Below a confidence threshold, don't auto-place — flag it for the user to confirm (mirrors "questions for you" style UX)

**Known weak spot:** connections within a session are currently too rare — the board should be noticeably better at noticing "this relates to what I said five minutes ago in this same session" than it currently is. Likely culprits to check rather than assume: (a) is Tier 1 actually being given the *full* list of currently-open nodes, or has it been truncated somewhere; (b) is the Tier 2 consolidation pass — which exists specifically to catch connections Tier 1's narrower context missed — actually running on a timer/interval, or silently not firing; (c) is the confidence threshold for auto-connecting set too conservatively, causing real matches to fall below it. Investigate which of these it actually is before changing behavior blindly.

**More specific and more urgent than the above:** as currently built, edges don't appear at all until the board is manually finalized/wrapped up — meaning `create_edge` isn't actually being emitted as a live Tier-1 op the way the Realtime delivery section below specifies, it's only happening in some end-of-session step. This needs to be a real-time op like `create_node` is, not deferred. Check whether Tier 1's prompt/logic even attempts edge creation per-utterance right now, or whether that job was only ever wired into the finalize step — this is likely a gap in the implementation, not a tuning problem like the weak-spot note above.

Every node also keeps a link to the raw utterance(s) that produced it, so a summary that's too compressed can always be expanded back to the original words.

### Realtime delivery — ops log, not full-state updates

This is the mechanism that makes the board feel alive as you speak, and it's not optional polish — get this wrong and nodes will appear to vanish or the whole board will feel like it's re-rendering on every utterance instead of growing.

- The moment Tier 1 finishes classifying **one single utterance**, it produces zero or more small discrete operations: `create_node`, `attach_node` (expand an existing node with new detail/link a new utterance to it), `create_edge`, `update_status`.
- Each op gets appended to an ops log for that session with an incrementing sequence number, and pushed to the frontend via Base44 realtime **the instant it's created** — never batched, never waiting for more utterances to accumulate first.
- The frontend applies each incoming op directly to its existing in-memory board state — add one node, draw one edge — it **never re-fetches or regenerates the whole board** in reaction to new speech. A full board render only happens once, on initial page load (replay the session's ops in order).
- Store this as its own append-only collection (see `session_ops` in the data model below), separate from the `nodes`/`node_edges` tables those ops describe — the log is the source of truth for "what happened and in what order," the tables are the current derived state.

### Fallback

If live Tier-1 placement isn't holding up reliably by demo time, batch-process the full transcript after the session ends instead. Same pipeline, just not streaming — this should be the safety net, not a separate system.

---

## 3. Data model (Base44 collections)

- **users** — id, email, name, role (user / admin), org_id, plan_id, created_at
- **orgs** — id, name, plan_id, seats_used
- **plans** — id, name, price_monthly, node_limit, session_limit, features[]
- **sessions** — id, owner_user_id, org_id, type (personal / meeting), capture_source (mic_live / bot_live / import), title, meeting_url, bot_id (Recall's bot ID, null unless capture_source is bot_live), status (active / processing / complete), started_at, ended_at
- **utterances** — id, session_id, speaker_label, text, start_ms, end_ms, finalized
- **nodes** — id, owner_user_id, session_id, type, title, summary, status (open / resolved / done / n-a), hidden (bool, default false — board-visibility toggle, separate from status; see delete/hide note below), confidence, created_at, updated_at
- **node_utterance_links** — node_id, utterance_id (raw-transcript backlink)
- **node_edges** — id, from_node_id, to_node_id, relation (expands / answers / blocks / relates_to)
- **node_notes** — id, node_id, text, created_at
- **session_ops** — id, session_id, seq (incrementing per session), op_type (create_node / attach_node / create_edge / update_status / add_note / hide_node), payload (JSON), created_at — the append-only realtime log described above; this is what the frontend subscribes to, not the nodes table directly
- **usage_events** — id, user_id, org_id, event_type, meta, created_at (feeds admin analytics + plan-limit enforcement)

---

## 4. Pages & flows

### Marketing
- Landing page — single page: hero, how it works, pricing, sign-up CTA

### Auth
- Sign up / log in (Base44 auth)

### Main app
- **Home ("your threads")** — list of past sessions, personal and meeting mixed or filterable, search bar up top
- **New session** — three entry points: "Start talking" (personal, hold-to-talk), "Invite the bot" (paste a Zoom/Meet/Teams link — creates the session and board instantly, Recall bot joins, nodes populate live as the call happens), or "Import a transcript" (paste/upload a transcript from elsewhere)
- **Board view** — the canvas. Live-updating nodes and connectors during capture; for meeting mode, a collapsible transcript panel alongside (not a fixed permanent column — keep the canvas as the hero, not a dashboard). Layout rule: the first node of a session centers on the canvas; new unrelated nodes extend rightward from the current rightmost node; a node that attaches to/expands an existing node stacks above that node rather than continuing the horizontal line. Canvas is pannable and zoomable (click-drag empty space, scroll/pinch to zoom), bounded to the content's bounding box plus padding rather than a truly unbounded infinite plane. Export the board as PNG (primary — quick sharing) or SVG (secondary — lossless zoom/editing); skip PDF, it's a poor fit for a spatial 2D board rather than a paginated document.
- **Node detail panel** — slides in on click: summary, linked transcript excerpts, related nodes in the same session, resolve/done controls for Question/Risk/Action, notes (add new, view existing — a small "n notes" badge on the node itself hints at this before opening the panel), and a delete/hide control. Deleting a node only hides it from the board — it doesn't touch the underlying utterance links or the node record itself, so the memory persists even though it's visually gone. Open question worth deciding during build: should a hidden node still be eligible for Tier 1 to re-attach new utterances to it? Default recommendation is no (the person deliberately hid it), but confirm rather than assume.
- **Search** — keyword search across a user's past sessions and nodes
- **Settings** — profile, plan/billing

### Admin (role-gated, separate route)
- **Dashboard home** — signups, active sessions, nodes created, MRR at a glance
- **Users** — searchable table, view detail, change plan, disable account
- **Plans/billing** — manage plan definitions, view subscriptions (Stripe via Base44 integration)

---

## 5. Design direction

Following a proper design pass (color/type/layout/signature), not defaulting to generic templates. Reference points: Letterly (crisp white, near-monochrome, almost no color outside one dark accent) and Cluely (bold, high-contrast, single loud accent, unapologetic confidence) — both share extreme restraint in the chrome, letting whitespace and typography carry the interface rather than decoration. That's the register the shell should sit in; the post-it nodes remain the one place personality lives.

- **Color** — crisp white base (not a cream/paper canvas), near-black for text, a single bold saturated brand accent (not muted) used sparingly for primary actions and the logo — kept separate from the node palette so the pastel nodes stay the visual focus, not competing with UI chrome.
- **Type** — a clean, confident sans for headers (restrained personality, closer to Letterly/Grammarly than a rounded playful face), paired with the same or a neutral sibling for body copy and metadata, so the interface reads premium throughout rather than twee.
- **Layout** — canvas-first. Thin, minimal top bar (icons over labels where possible). The board fills the viewport; transcript and node-detail panels slide in rather than living in a permanent fixed column, so the map itself stays the hero the way the reference tool's dashboard-style layout doesn't.
- **Signature element** — the nodes themselves, styled as Neubrutalist post-it notes: solid pastel fill, a thick black border (not a soft colored outline), a hard-edged solid offset shadow instead of a soft blurred one (the classic Neubrutalist "sticker" look — shadow reads as a flat block of color sitting behind the card, not a glow), bold sans-serif type on the card itself, a few degrees of random rotation per card so they feel placed rather than machine-gridded. High-contrast and graphic against the restrained white/near-black shell — this is the one place color, weight, and playfulness live; everything else stays quiet so the nodes pop even harder.
- **Motion** — nodes pop in with a snappy, slightly bouncy scale-up when created live, not a plain fade — should feel like it jumps into place. Connectors animate in when a connection forms, not just appear instantly. Live transcript utterances float upward gently before dismissing once processed, rather than just vanishing. A visible "listening" indicator with its own animation while the mic is actively held (working name: "tackling" — open to a better one). Restrained everywhere else — no decoration that doesn't serve the moment of a thought becoming visible.
- **Landing page (later phase, noted now so it isn't lost)** — Cluely-level confidence: bold headline, generous whitespace, minimal nav, one strong CTA, and the live node-map animation itself as the hero moment rather than a static screenshot.

This direction is a starting point for whoever builds the UI — worth running through a proper brainstorm/critique pass (per the frontend-design process) before locking exact hex values and fonts, rather than treating the above as final.

---

## 6. Phased build plan (phases — build and review each one before moving to the next, not literal calendar days)

- **Phase 1 — Foundation.** `npx base44 create`, auth, full data model above, design tokens scaffolded into the codebase, basic app shell (routing for main app + admin).
- **Phase 2 — Import + classify.** Transcript paste/upload flow, Tier-1 classification function, same-session node matching, board canvas rendering with post-it-style nodes (simple layout algorithm to start).
- **Phase 3 — Linking + detail.** Connector rendering between nodes, node detail panel with linked transcript excerpts, Tier-2 consolidation pass, resolve/done toggling for Question/Risk/Action nodes.
- **Phase 4 — Live capture (personal + meeting).** Two capture sources feeding the same real-time pipeline: (1) hold-to-talk browser capture via AssemblyAI, (2) "Invite the bot" flow — Recall bot joins a pasted meeting link, webhook streams utterances into the same Tier-1 pipeline live. Plus the search page (keyword search across a user's own sessions).
- **Phase 5 — Admin + billing + polish.** Admin dashboard (users, plans), billing wiring, full design polish pass (post-it aesthetic + motion applied everywhere), landing page.
- **Phase 6 — Demo prep.** Demo video, docs/README, bug bash, submission buffer.

---

## 7. Open questions to confirm during build

- Plan/pricing tiers aren't decided yet — needed before the billing wiring in Phase 5.
- Node taxonomy (8 types above) is still evolving — fine to adjust further after seeing real sessions mapped.
- Recall's real-time webhook needs a publicly reachable endpoint from a Base44 function, and Recall's webhook payloads should be signature-verified, not trusted blindly — confirm Recall's exact verification method when wiring this up in Phase 4.
- Known bug as of the current build: nodes disappear whenever a new push-to-talk utterance is added (the transcript tab correctly keeps everything, only the node board loses prior nodes). This is almost certainly the symptom of a full-state overwrite happening somewhere — either the backend regenerating/upserting the whole node set per utterance instead of only adding what's new, or the frontend replacing its board state wholesale on each update instead of merging. Fixing the realtime delivery to match the ops-log pattern above should resolve this as a side effect, but verify directly: after the fix, push-to-talk twice in one session and confirm the first utterance's node(s) are still on the board after the second.
- If live bot capture (Phase 4) turns out less reliable than expected under time pressure, fall back to the existing paste/import path for meetings rather than letting it block the rest of the build — same fallback logic as the personal-capture fallback above.
