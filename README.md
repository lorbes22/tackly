# Tackly

Tackly turns spoken or typed thought — a meeting, a rambling voice note, a solo brainstorm — into a living map of post-it-style nodes instead of a linear transcript. Built on the Base44 backend platform with a Vite + React frontend. See [PLAN.md](PLAN.md) for the full product plan.

## Structure

```
base44/                       # Backend configuration
├── config.jsonc              # Project settings
├── entities/                 # Data schemas (Session, Utterance, Node, edges, …)
└── functions/                # Deno backend functions
    ├── process-session/      # Tier-1 classification (utterances -> nodes)
    ├── consolidate-session/  # Tier-2 pass (merges + connector edges)
    ├── assemblyai-token/     # Temp streaming token for hold-to-talk
    ├── recall-start-bot/     # Send a Recall bot into a meeting
    ├── recall-stop-bot/      # Bot leaves; session wraps up
    └── recall-webhook/       # Ingests Recall realtime transcript events

src/                          # Frontend
├── pages/                    # Landing, auth, app (board, search, …), admin
├── components/               # NodeCard, EdgeLayer, LiveBars, panels
└── lib/                      # AuthContext, useHoldToTalk, transcript parser
```

## Development

```bash
npm install
npm run dev        # http://localhost:5173
```

Backend changes: `npx base44 entities push` for schemas, `npx base44 functions deploy` for functions.

## Live capture

Two capture paths feed the same Tier-1 classification pipeline:

**Personal hold-to-talk (AssemblyAI).** The browser asks `assemblyai-token` for a short-lived streaming token (the API key never reaches the client), then streams 16 kHz PCM16 mic audio through the official `assemblyai` SDK. Finalized turns become utterances; classification runs from the open board. Every release/unmount/error path terminates the streaming session explicitly — an abandoned session keeps billing until AssemblyAI's 3-hour cap.

Streaming parameters live in `src/lib/useHoldToTalk.js` (and are documented in `docs/assemblyai-agent-instructions.md` — read it before touching this integration):

| Parameter | Value | Notes |
|---|---|---|
| `speechModel` | `universal-3-5-pro` | decided in PLAN.md — don't re-litigate |
| `sampleRate` | `16000` | matches the AudioWorklet resampler |
| `mode` | `balanced` | latency/accuracy preset; primary tuning knob |
| `speakerLabels` | `true` | harmless single-speaker default |

**Meeting bot (Recall).** `recall-start-bot` creates the session and sends a Recall bot to the pasted meeting link with `recallai_streaming` transcription and a realtime webhook (`recall-webhook`). Events are verified via the unguessable bot id plus a per-session token echoed in endpoint metadata. Utterances land via service role with `owner_email` so RLS keeps them owner-readable.

**Secrets** (set via `npx base44 secrets set KEY=value`): `ASSEMBLYAI_API_KEY`, `RECALL_API_KEY`, optional `RECALL_REGION` (defaults to `us-east-1` — must match the region of your Recall API key).

## Testing capture locally

- **Hold-to-talk:** log in → New session → Start talking → open the board, hold the button (or Space), speak, release. Partial text shows under the mic button; finalized turns become nodes within a few seconds.
- **Meeting bot:** start a real meeting (e.g. an empty Google Meet), New session → Invite the bot → paste the link. Admit the bot from the lobby, talk, and watch utterances/nodes arrive. The webhook needs no tunnel — it's a deployed Base44 function, publicly reachable.
