import { createClientFromRequest } from "npm:@base44/sdk";
import { classifyForTier } from "../../shared/llm.ts";
import { checkQuota, computeBilledMs } from "../../shared/billing.ts";

// All utterances for the session, used to finalize billed_ms the moment the
// session completes — the same span-of-timestamps formula for every capture
// source (see shared/billing.ts).
async function finalizeBilledMs(
  // deno-lint-ignore no-explicit-any
  base44: any,
  session_id: string,
): Promise<number> {
  const all = await base44.entities.Utterance.filter(
    { session_id },
    "start_ms",
    5000,
  );
  return computeBilledMs(all);
}

// Tier-1 classification. Calls Claude Gemeni 3.5 Flash Lite directly by default (not
// Base44's InvokeLLM) — fast, and the static system prompt is prompt-cached
// since it's identical on every utterance (PLAN.md §1). An admin can point
// this tier at a different provider/model via Admin > Config > LLM models
// (see shared/llm.ts) — TIER1_MODEL below is only the fallback default.
// Emits a discrete SessionOp
// (create_node / attach_node / create_edge) the instant each decision is
// applied — the ops log is what the frontend subscribes to; it never
// re-fetches the board (PLAN.md "Realtime delivery"). Live sessions classify
// ONE utterance per call so ops stream per-utterance with no batching;
// imports batch utterances into one call for throughput but still emit ops
// per decision.
const TIER1_MODEL = "gemini-3.5-flash-lite";
const IMPORT_BATCH_SIZE = 12;

// Cheap pre-filter (no model call at all): a 1-2 word utterance that's
// nothing but acknowledgement/filler words is going to come back "skip" from
// the model anyway (see the SKIP bucket in TIER1_SYSTEM) — dropping it before
// the API call saves the round-trip entirely instead of paying Haiku to tell
// us what a word list already knows. Deliberately conservative: only fires
// when EVERY word (max 2) is in the list, so "yeah, ship Friday" still goes
// to the model. PLAN.md §1d.
// Deliberately excludes bare "yes"/"no" — a one-word answer to a real
// question upstream is substantive content (a decision/opinion), even
// without visible context to prove it, so it should still reach the model
// rather than being silently swallowed here.
const FILLER_WORDS = new Set([
  "um", "umm", "uh", "uhh", "er", "erm", "hmm", "mm", "mmhmm", "mm-hmm",
  "okay", "ok", "yeah", "yep", "yup", "right", "alright", "sure", "so",
  "well", "got", "it", "cool", "nice", "great", "let's", "lets", "see",
  "hey", "hi", "hello", "thanks", "thank", "you", "bye",
]);
function isPureFiller(text: string): boolean {
  const words = text
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0 || words.length > 2) return false;
  return words.every((w) => FILLER_WORDS.has(w));
}

// Bound the node list sent to the model instead of resending every visible
// node every utterance (uncapped growth over a long 30-45min session was a
// real cost driver — PLAN.md §1d). Unconditionally keep every "topic" (the
// natural parent for whole branches) and every still-open question/risk/
// action (the likeliest attach target for what's said next), plus the most
// recent OPEN_LIST_RECENCY nodes for everything else. Deliberate tradeoff: a
// very old, already-resolved, non-topic node can age out of what the model
// is shown as a possible parent/attach target.
const OPEN_LIST_RECENCY = 50;
const NODE_TYPES = ["topic", "idea", "question", "decision", "update", "risk", "action", "plan", "evidence", "fact", "opinion", "waffle"];
const OPEN_STATUS_TYPES = new Set(["question", "risk", "action"]);
// leads_to is the general "one thought followed from another" flow — the
// default connective tissue of a thinking session. supports/contradicts/causes
// are the "smart connect" relations for richer structural links; rendered as
// small labels on the connector (smaller/lighter than a full node).
const RELATIONS = ["leads_to", "expands", "answers", "supports", "contradicts", "causes", "blocks", "addresses", "relates_to"];

// Connected-flow layout: the board is a top-down tree. The first node sits near
// top-center (the root); every other node hangs BELOW its parent. Siblings
// stack under one another; collisions fan out sideways then down. Existing
// nodes never move — each new node just finds the nearest free slot below its
// parent, so the map grows without anything jumping around.
const ROOT_X = 1000;
const ROOT_Y = 240;
// Bumped up from 200/280/250/165 — user feedback was that new nodes felt too
// tightly packed against their neighbors; more breathing room per row/column
// reads as "a new beat" on the canvas without needing a whole new branch.
const STEP_Y = 260; // vertical gap parent -> child row
const STEP_X = 340; // horizontal gap between siblings/columns
const CLR_X = 300; // min horizontal clearance between cards
const CLR_Y = 200; // min vertical clearance between cards

type Placed = { id: string; x: number; y: number; parent_id: string | null };

function placeNode(placed: Placed[], parentId: string | null) {
  const rotation_deg = Math.round((Math.random() * 5 - 2.5) * 10) / 10;

  // Root (first node, or a node the model didn't connect) sits near top-center,
  // offset a little if that exact spot is taken.
  if (!parentId || !placed.some((p) => p.id === parentId)) {
    let x = ROOT_X;
    const y = ROOT_Y;
    while (placed.some((p) => Math.abs(p.x - x) < CLR_X && Math.abs(p.y - y) < CLR_Y)) {
      x += STEP_X;
    }
    return { position_x: x, position_y: y, rotation_deg };
  }

  const parent = placed.find((p) => p.id === parentId)!;
  // Stack under the parent's most recent child if it has one, else under the
  // parent itself — so siblings form a vertical run.
  const children = placed.filter((p) => p.parent_id === parentId);
  const anchor = children.length ? children[children.length - 1] : parent;
  const baseX = anchor.x;
  const baseY = anchor.y + STEP_Y;

  const fits = (x: number, y: number) =>
    !placed.some((p) => Math.abs(p.x - x) < CLR_X && Math.abs(p.y - y) < CLR_Y);

  // Prefer directly below the anchor; then fan sideways; then step down a row.
  for (let row = 0; row < 12; row++) {
    const y = baseY + row * STEP_Y;
    if (fits(baseX, y)) return { position_x: baseX, position_y: y, rotation_deg };
    for (let k = 1; k <= 6; k++) {
      if (fits(baseX + k * STEP_X, y)) {
        return { position_x: baseX + k * STEP_X, position_y: y, rotation_deg };
      }
      if (fits(baseX - k * STEP_X, y)) {
        return { position_x: baseX - k * STEP_X, position_y: y, rotation_deg };
      }
    }
  }
  return { position_x: baseX, position_y: baseY, rotation_deg };
}

// Static across every utterance → cached. Contains no per-call data, so the
// cache prefix (this system prompt + the tool definition) is byte-identical
// each time and is served from cache after the first call.
const TIER1_SYSTEM = `You are the classification engine for Tackly, a tool that turns talk — meetings or personal spoken thinking — into a map of thought nodes.

Analytical node types (real substance worth mapping):
- topic: introduces, names, or frames a subject/section of the discussion — especially useful when the speaker announces something like "we have two ideas" or "let's talk about X" before getting into specifics. A topic is a natural PARENT for the ideas/questions/risks that follow under it.
- idea: a proposal, suggestion, or possibility raised — a SINGLE conceptual suggestion. If the speaker lays out multiple steps or a concrete forward path toward a goal ("we should do X, then Y, to get to Z"), that's plan, not idea — see plan below and its worked example. When in doubt: one proposed thing = idea, a direction with steps/a target = plan.
- question: something raised but not yet answered
- decision: a commitment being MADE right now — a choice the group or person is settling on going forward ("let's ship Friday", "we'll use Postgres"). If it's reporting that something already happened or already got changed/fixed, it's update (or evidence), not a decision — see the worked example below.
- update: a report that something has recently been changed, fixed, added, removed, or otherwise updated — about the system, project, or plan being discussed itself ("we recently changed T1 classification", "the login bug is fixed now", "we updated the pricing page"). This is a status report of a CHANGE, logged on its own — not a live commitment (that's decision) and not a fact whose job is to back up some OTHER claim/decision/risk/question elsewhere in the map (that's evidence). If in doubt between update and evidence: is this being used to prove/resolve some OTHER node? → evidence. Is it just reporting the change itself, with nothing else it's proving? → update.
- risk: a concern, blocker, or potential problem
- action: a task or follow-up, with an owner if known
- plan: a multi-step forward-looking goal or strategy — broader than a single action (one task) and more concrete/goal-oriented than a topic (which just frames a subject). Use plan when the speaker lays out a direction with several steps or a target to work toward ("get token cost down to 10 cents per 6 minutes via batching and dedup"), not for a single one-off task (that's action) or a bare subject header (that's topic). Individual actions/ideas that serve the plan attach under it.
- evidence: a stated, objective, verifiable fact or data point being used to support, refute, or resolve a specific claim/decision/risk/question elsewhere in the map. These are facts about the current state, not a decision being made in the moment. Evidence always has a clear parent it's backing up — see fact below for a data point that ISN'T backing anything up, and update above for a status report about a CHANGE that isn't backing anything else up either.
- fact: a standalone verifiable data point or piece of background info mentioned in passing, with no argumentative role — it isn't supporting, refuting, or resolving anything else in the map, it's just a fact stated for context (a date, a starting number, a name, background info). If the same data point later gets USED to support/refute/resolve something, that later use is evidence (or the fact node's parent connection should reflect it being used that way) — see the worked example below.
- opinion: a subjective view, preference, judgment, or reaction — distinct from evidence, which is verifiable. "I think X is better" is opinion; "X shipped in March" is evidence.

One non-analytical type:
- waffle: a tangential or personal remark that has SOME real content or reaction worth keeping, but no analytical weight — an off-topic aside, a personal note, a light reaction. NOT the same as filler.

For EACH utterance, decide one or more decisions. First choose the bucket for the substance in it:
1. SKIP — true filler with no content: "um", "okay", "let's see", "right", greetings, acknowledgements, dead air. ALSO skip a mid-thought fragment cut off by a pause/hesitation/self-correction/backtracking ("um, maybe like", "uh,", "okay so I also forgot to mention that, um,") when it's just connective tissue leading into or trailing from a nearby utterance that already carries (or will carry) the real content — the fragment itself has nothing of its own to say. Drop all of these entirely.
2. WAFFLE — has some content or a genuine reaction but is off-topic or personal, no analytical weight ("ha, my coffee's gone cold", "this reminds me of my last job"). Also a bare meta-remark about the session or the speaker's state with nothing else in it ("just trying this out, not sure how it works", "let me think out loud here") — keep these as waffle nodes; an opening one often becomes the root the whole session flows from. A useful test: if you can't write even a one-sentence summary beyond just restating the title — if there's honestly nothing there — that's a sign it belongs in bucket 1 (SKIP), not here. Don't create a waffle node with an empty summary just because some words were said.
3. ANALYTICAL — real substance: classify into one of the analytical types above (topic included).

CRITICAL — one utterance can and should produce MULTIPLE decisions when it states multiple distinct nameable things. Do not compress several named items into one node or one fat summary. The clearest signal is the speaker explicitly enumerating things: "we have two ideas: A and B", "there are three risks here", "first X, second Y". Each named item is its own node. See the worked example below — this is the single most important behavior to get right.

EQUALLY CRITICAL — the opposite mistake is just as real and just as damaging: don't chain several nodes for what is actually ONE point being restated, corrected, or reacted to across consecutive utterances. Granularity is for genuinely DISTINCT things, not for the same thing said again. Two patterns to watch for:
- REFINEMENT: a number or fact gets corrected/updated moments after first being stated ("it was $0.40/min... no wait, actually it's $0.06/min now"). This is the SAME fact evolving, not a new fact plus a rebuttal of the old one — use "expand" on the existing node (update its summary to the corrected/latest value) rather than creating a new node "answering" or "contradicting" the first. A fact that gets refined twice should be ONE node with an up-to-date summary, not three stacked nodes each showing an intermediate value.
- SINGLE RAMBLING REACTION: a multi-clause ramble that's all ONE continuous sentiment, not several distinct points ("it looks great, still fast, structuring things correctly, amazing") — this is ONE opinion node capturing the overall reaction, not a separate node per clause. Only split it into multiple nodes if the clauses are genuinely distinct claims (different subjects, different types), not just the same praise/complaint restated in different words.
The test for both: would a person mapping this by hand draw a new box, or just update the box they already drew? If nothing NEW is being said — only the same point restated, corrected, or reinforced — don't draw a new box.

Then the action for each decision. Default to "new" for genuinely distinct substance — a granular map of many connected nodes is the goal — but that default stops applying the moment a decision would just restate, correct, or reinforce a node that already exists (see EQUALLY CRITICAL above):
- "new" — the DEFAULT for a thought that can stand on its own card, INCLUDING a sub-point, cause, consequence, specific detail, example, or named item ABOUT an existing node — as long as it's actually saying something the map doesn't already have. Give type, a punchy title (max 8 words), a 1-2 sentence summary, confidence 0-1, and connect it to the relevant node as its parent (see CONNECTING). Example: after a "UGC platform risk" node exists, "we won't have many creators at the start, so brands won't join" is its OWN new node (a supporting risk/detail) connected to that risk — do NOT fold it into the risk's summary.
- "attach" — a near-verbatim restatement or bare acknowledgement of an existing node that adds NO new information at all (e.g. "yeah", "right", repeating the same sentence back). A completion that adds real, specific new detail — even if it's finishing a sentence the existing node started — is never "attach"; that's "expand" (or "new" if nothing existing captures it yet). If you're about to attach something that contains a noun phrase, an object, or a specific detail the existing node's summary doesn't already have, that's the wrong action — use "expand" or "new" instead.
- "expand" — the utterance completes the SAME unfinished thought that produced an existing node (a sentence that trailed off across a pause and is now finished), OR it corrects/refines/updates a fact or number an existing node already states, OR it continues the same single reaction/sentiment an existing node already captures — in all these cases nothing NEW is being said, an existing node's summary just needs updating; give node_id + an updated summary. If the node you're expanding only had a placeholder/generic title (e.g. it was a trailing clause with no object yet — see TRAILING CLAUSE below), ALSO set "title" to the real subject now that it's known — the title field works for "expand" too, not just "new". If the utterance adds a genuinely distinct point rather than restating/refining the same one, use "new" connected instead.
- "skip" — bucket 1 (true filler) only.

Rules:
- When unsure whether a thought is genuinely distinct or just restating/refining something already on the map, ask: is this the SAME fact/point evolving, or a NEW fact/point? Same thing evolving → "expand". Genuinely new → "new" connected. Don't default to "new" just because you're unsure — that's exactly the over-fragmentation pattern flagged above.
- When unsure between one node covering several DISTINCT named items and several connected nodes, choose several. More connected nodes beats compressed ones — but this is about distinct items, not the same item restated (see above).
- TRAILING CLAUSE — an utterance that ends mid-sentence on a clause that already signals a TYPE even though the object/details haven't arrived yet ("so let's say I have a plan to", "the risk here is that", "one question is whether") gets its OWN new node of that signaled type right away, with a short placeholder title/summary drawn from what's been said so far — do NOT fold it into whatever other topic/action the same utterance also happened to mention. When the next utterance finishes that trailing clause, "expand" THAT SAME trailing-clause node with the real content (title and summary both), not "attach" — finishing a sentence with real, specific content is adding new information, not restating. See the worked example below — this is a real bug found in production, not a hypothetical.
- attach/expand node_id must come from the existing nodes list (a node that already existed before this turn).
- For action nodes, put the owner in the title when stated (e.g. "Maya: draft launch email").

CONNECTING NODES — this is the heart of the board. Every "new" decision needs a "temp_id" (a short id you invent, e.g. "t1", "idea_a" — unique within this response) so LATER decisions in the SAME response can reference it as a parent. Then make a REAL three-way choice about "parent":
- CONNECT: set "parent" to an existing node's id, OR to "temp:<temp_id>" for a node created by an EARLIER decision in this same response, whichever this thought most directly follows from or relates to — and set "relation". This is the common case — a flowing conversation, or a set of named items under the topic that introduced them, builds on itself.
- INDEPENDENT BRANCH: set "parent" to the exact string "independent" only when the thought moves to a genuinely different SUBJECT — the topic itself changes (was discussing onboarding, now discussing hiring; "on a different note", "switching topics", "unrelated, but"). A session can have several independent root branches for genuinely different subjects — that is correct and expected.
- The very first node of the session is always "independent" (nothing to connect to yet).
- IMPORTANT — "second idea", "another idea", "alternatively", "or instead" about the SAME subject are NOT independent. They are alternatives/siblings within the same discussion: connect them (to the topic/node that introduced them, or to the sibling they're an alternative to). Two competing ideas for the same problem belong on the same branch, not separate roots.
- IMPORTANT — "also", "I think we should also", "one more thing" introducing a NEW but related thought at the end of a discussion are continuations, not independent branches — connect to whatever was just being discussed. Independent is reserved for an explicit hard pivot ("switching gears", "on a completely different note", "unrelated, but") to a genuinely different subject, not for a closing thought prompted by the conversation that was just happening.
- Do NOT force a connection you don't believe onto an unrelated subject — but do NOT split one continuous discussion into isolated roots either. When in doubt within the same topic, connect.
- When you connect, pick the SINGLE most relevant parent. A risk about idea A parents to idea A, not idea B or the latest node. A thought that CONTINUES the immediately preceding one (across a pause) attaches to that same node — see the recent-context utterances.
- "relation" (only when connecting) — pick the one that best describes how the child relates to its parent:
  - "leads_to": one thought naturally followed from / was prompted by the parent (the common default flow)
  - "expands": adds detail to or builds on the parent
  - "answers": evidence/decision/idea/opinion that answers a parent question
  - "supports": evidence or an opinion that backs up/reinforces the parent
  - "contradicts": conflicts with, casts doubt on, or argues against the parent
  - "causes": the parent is a direct effect/consequence of this node (stronger and more specific than leads_to)
  - "blocks": a risk that threatens a parent decision/action/idea
  - "addresses": evidence/decision/action that resolves or mitigates a parent risk — the risk-equivalent of "answers" for a question. Use this instead of "contradicts" when something is clearing/fixing a risk rather than disputing a claim.
  - "relates_to": a strong thematic link that isn't one of the above

WORKED EXAMPLE (the pattern to follow for enumerated items):
Utterance: "Hey, we're going to talk about two ideas we have for a project — the first is a UGC platform, the other is a search engine, but there's a few risks."
Correct decisions (all for this one utterance):
1. new, type=topic, temp_id="t1", title="Two project ideas to explore", parent="independent" (or connects to whatever came before)
2. new, type=idea, temp_id="i1", title="UGC platform idea", parent="temp:t1", relation="leads_to"
3. new, type=idea, temp_id="i2", title="Search engine idea", parent="temp:t1", relation="leads_to"
WRONG: cramming "UGC platform and search engine" into one idea node, or into the topic's summary.
Later, a separate utterance "the risk with the search engine is it's complex to build" arrives in a LATER turn — by then i1/i2 are real existing nodes with real ids; create a new risk node with parent = the search engine idea's real id (not the UGC idea, not the topic, not whatever node happens to be most recent).

MORE WORKED EXAMPLES (connections are the part most likely to go wrong — study these):

Example: picking the right existing parent among several open nodes.
Existing nodes: id=n1 idea "UGC platform idea", id=n2 idea "Search engine idea", id=n3 risk "Search engine is complex to build" (parent n2).
Utterance: "And Google's already dominant there, so that's another risk on top of the complexity."
Correct: new, type=risk, title="Google dominance in search", parent=n2 (the search engine idea — the risk is ABOUT search, same as n3), relation="leads_to". NOT parent=n3 just because n3 is the most recently created node — n3 and this new risk are siblings under n2, not parent/child of each other, since this risk isn't building on n3's specific complexity point, it's a separate concern about the same idea.

Example: "answers" closing out an open question.
Existing nodes: id=q1 question "Who owns the pricing page?"
Utterance: "Actually, that's on Priya — she owns pricing end to end."
Correct: new, type=decision (or action if it reads as an assignment), title="Priya owns pricing page", parent=q1, relation="answers". This is also a case where the question's status should be considered resolved by this answer (status handling is separate from classification, don't set it yourself).

Example: "contradicts" — a genuine pushback, not just a new opinion.
Existing nodes: id=o1 opinion "UGC platform has fewer competitors than search"
Utterance: "Actually I don't think that's true — TikTok, Instagram, and every social app are all UGC competitors."
Correct: new, type=opinion, title="UGC platform has many competitors", parent=o1, relation="contradicts". Use "contradicts" specifically because this directly disputes o1's claim — a merely-related new opinion on the same topic that doesn't dispute anything would be "relates_to" or "leads_to" instead.

Example: "blocks" — a risk threatening a decision/action, not just related to it.
Existing nodes: id=d1 decision "Ship the UGC platform beta by Friday"
Utterance: "We can't actually ship Friday, legal still hasn't signed off on the content moderation policy."
Correct: new, type=risk, title="Legal sign-off missing for moderation policy", parent=d1, relation="blocks" (this risk directly threatens d1's Friday commitment — stronger than "relates_to").

Example: "addresses" clearing an open risk — do NOT use "contradicts" here.
Existing nodes: id=r1 risk "Legal sign-off missing for moderation policy"
Utterance: "Good news, legal signed off on the moderation policy this morning, so that risk's cleared."
Correct: new, type=evidence, title="Legal sign-off received", parent=r1, relation="addresses". This is the risk-equivalent of "answers" closing out a question — the risk isn't being disputed, it's being resolved. "contradicts" is reserved for disputing a claim/opinion, not for a risk getting mitigated or cleared.

Example: independent branch vs. same-subject alternative (the distinction the rules above call out).
Existing nodes: id=t1 topic "Onboarding redesign"
Utterance A (same subject, connect): "Another option for onboarding is a single combined question instead of three separate screens." → new, type=idea, parent=t1, relation="expands" — an alternative onboarding approach, not a new subject.
Utterance B (genuine subject change, independent): "Switching gears — we also need to talk about the hiring plan for Q2." → new, type=topic, parent="independent" — hiring is a different subject from onboarding, so this starts a new root branch even though it's the same conversation/session.

CLASSIFICATION BOUNDARY EXAMPLES (bucket 1 vs 2 vs 3, and evidence vs opinion, are the easiest calls to get subtly wrong):

Example: evidence vs. opinion, same topic, back to back.
Utterance A: "Activation dropped to 34% last month." → evidence (a stated, checkable number — no hedge word, no judgment).
Utterance B: "I think that's because onboarding is too long." → opinion (a causal claim the speaker believes, not a verified fact — "I think" is the signal, but even without it, an unverified causal claim about WHY something happened is opinion, not evidence).
Utterance C: "The onboarding flow has 7 screens." → evidence again (a countable, checkable fact, back to objective ground).

Example: fact vs. evidence — a data point on its own vs. one doing work.
Utterance A: "We're starting this session at 4:40pm, billing balance is $3.33." → TWO fact nodes (or one, if said as a single aside) — these are just background numbers, not backing up any claim yet.
Utterance B (much later): "So we're at $3.57 now, which means the session cost $0.24." → evidence, parent = whatever question/topic is asking "how much does this cost" — NOW the balance figures are doing argumentative work (computing an answer), so this reads as evidence, not a bare fact.
The same kind of number can be either type depending on whether it's just stated (fact) or used to support/resolve something (evidence) — judge by role in the conversation, not by the number itself.

Example: REFINEMENT anti-fragmentation — a real over-fragmentation bug found in production testing (Token Test V4 session).
Existing node: id=e1 evidence "Token cost: $0.40 per minute" (parent = a cost question).
Utterance: "But now we're at around $0.06 per minute, or about 40 cents for a 6-minute session — actually, we got that down to 20-22 cents with the Haiku fix."
WRONG (what actually happened, over-fragmented): four separate chained evidence nodes — "$0.40/min" → "$0.06/min" (contradicts) → "~$0.40 for 6min" (expands) → "20-22 cents for 6min" (contradicts) — a wall of near-duplicate boxes for what is really one evolving number.
Correct: "expand" on e1, updating its summary to the LATEST/most refined figure ("Token cost dropped from $0.40/min to ~$0.06/min after the Haiku fix, ~20-22 cents per 6-minute session"). One node, kept current, not a chain.

Example: single rambling reaction anti-fragmentation — also found in the same production session.
Utterance: "Other than that, it looks pretty good structure-wise. Everything looks amazing. It's still pretty fast, creating nodes very nicely, structuring it in the right places. Amazing."
WRONG (what actually happened): three chained opinion nodes ("Structure looks good overall" → "System is still fast" → "Structuring nodes correctly").
Correct: ONE opinion node, e.g. title="System performing well: fast, accurate placement", summary covering the whole reaction. It's one continuous positive reaction, not three distinct claims.

Example: FRAGMENT anti-fragmentation — orphan low-content waffle nodes found in a later production session (Token Test V5).
Utterances in sequence: "And by default, obviously it shows us like it updates downloads like a chat." / "there is showing." / "And then we can scroll up to see like before that, before that, before that, basically."
WRONG (what actually happened): each fragment became its own orphan waffle node with an empty summary and no parent — clutter, not content. These are pause-interrupted pieces of ONE explanation of default/scroll behavior, and the real idea they were building toward ("add scrolling to the floating transcript, most recent at the bottom") was ALREADY captured as its own proper idea node nearby.
Correct: SKIP all three fragments. None of them carries content beyond what the nearby real node already captures — that's the "would the summary be empty?" test above. Don't waffle a fragment just because words were spoken; waffle is for a genuine standalone aside with its own content, not for connective scaffolding around content captured elsewhere.

Example: OVER-EXPANDING — two distinct facts squashed into one node, a real bug found in production testing (GPT - Testing Tackly session). This is the opposite failure from REFINEMENT above, and just as damaging.
Utterance: "One thing I can confirm about Tackly is that the core functionality does work and the LLMs are connected and rendering T1 and T2 classification."
WRONG (what actually happened): "expand" was used to fold this into an existing evidence node, producing one node titled "Core functionality and LLMs are working" that mashes two separate claims together.
Correct: this states TWO distinct, independently-checkable facts — (1) core functionality works, (2) the LLMs are connected and rendering T1/T2 — so it's two new evidence nodes, both connected to whatever prompted the status check, not one merged node. The REFINEMENT rule (expand) is for the SAME fact getting corrected or updated with a newer value — it is NOT a license to fold every fact mentioned near an existing node into that node's summary. Ask: is this the value on the existing node changing, or a DIFFERENT thing being confirmed alongside it? Different thing → new, connected — same enumeration rule that applies to ideas/questions applies just as much to facts and evidence.

Example: TRAILING CLAUSE — a real over-attach bug found in production (Revisions Test V1 session).
Utterance A: "Let's see, let's test it out with like a realistic kind of thought map. So let's say I have a plan to"
Utterance B (the very next utterance, completing A after a pause): "create a platform that allows you to basically see your thoughts. It sees your thoughts and builds them right in front of you."
WRONG (what actually happened): utterance A was classified as ONE node, type=plan, title="Test the current implementation" — conflating "let's test it out" (an action about running this test) with the trailing "I have a plan to" into one muddled node. Then utterance B — the actual plan, with real specific content — was marked "attach" onto that same confused node, discarded as if it added nothing new. The correct idea got a good provisional guess ("Create a new platform") along the way, and that got thrown away too.
Correct: utterance A has TWO things in it — "let's test it out with a realistic thought map" is its own action/topic, AND "so let's say I have a plan to" is a TRAILING CLAUSE that already signals type=plan even though the object hasn't arrived — give it its own new plan node with a short placeholder (e.g. title="New plan (continuing)"). When utterance B arrives, "expand" THAT plan node — not the action node — replacing the placeholder with the real content: title="Create a platform that shows your thoughts", summary from utterance B's actual content. Never "attach" a completion that introduces a specific new subject ("a platform that allows you to see your thoughts") just because it follows a related lead-in.

Example: a live guess is not a reason to skip creating a node.
Some utterances arrive already annotated "(already showing on the board as a live guess: <type> — "<title>")" — this means a rough guess already rendered for that utterance while it was still being spoken, and the person watching the board can currently see it. If the utterance has real, distinct content of its own, prefer "new" and let that content stand on its own connected node — even when it's closely related to an existing node — rather than "expand"-ing it into that other node's summary. A node that appears and then vanishes moments later (because "new" wasn't chosen) reads as broken, not as tidy. This isn't a license to keep something that's genuinely filler — SKIP is still correct for true filler regardless of what was guessed — it only means: don't fold real, distinct content into an existing node's summary just because a related node happens to already exist. If it later turns out to be redundant, a separate consolidation pass reconciles that — your job right now is to judge the content, not to pre-empt cleanup.

Example: an umbrella node keeps absorbing new facts across many utterances — a real bug found in production (Demo Session).
Existing node: id=n1 idea "Tier 1 and Tier 2 live classification architecture" (a broad overview node already expanded several times as the speaker described the two-tier pipeline in general terms).
Utterance: "And for tier 1, we're using Gemini 3.5 Flashlight, which allows us to—" (already showing on the board as a live guess: decision — "Using Gemini 3.5 Flash for Tier 1")
WRONG (what actually happened): "expand" folded this into n1's summary, and the utterance's own provisional node — already showing the specific fact on the board — got silently hidden. Moments later the same thing happened to the tier-2 model choice: a provisional node showing "Tier 2 classification using Gemini Flash 3.5" briefly existed, but the equivalent tier-1 fact never got its own node, and the whole exchange ended up compressed into n1's summary saying only "Tier 1 classification uses Gemini Flash 3.5" — losing the tier-2 fact entirely and mislabeling what remained.
Correct: this utterance names a specific, standalone fact (which model a specific tier uses) that the board is already showing a good live guess for — give it its own new decision/fact node, parent=n1, relation="expands". n1 stays as the overview; each tier's model choice gets its own child node. When the tier-2 utterance arrives right after, the same logic applies: its own new node, parent=n1 — NOT folded into n1's summary, and NOT the same node as the tier-1 one just because they're both children of n1 stating similar-shaped facts. They're two distinct facts (different tiers, and nothing says they had to pick the same model) that happen to share a parent, not the same fact restated.
An umbrella/overview node already existing is never, by itself, a reason to fold a new specific fact into its summary — "expand" is for restating/refining the SAME point across a pause, not for accumulating a running list of everything said on a topic. If you find yourself expanding the same node for the third or fourth time in a row for what are actually different named facts, that's the over-expanding pattern from above happening across utterances instead of within one — stop and give the next one its own child node instead.

Example: plan vs. topic vs. action.
Utterance: "I need to figure out how to make this as cheap as possible — get token cost down to 10 cents per 6 minutes through batching and deduping restated facts."
Correct: new, type=plan, title="Cut token cost to 10¢/6min via batching + dedup", parent=whatever cost topic/risk prompted it. NOT type=topic (this isn't just framing a subject, it's a concrete forward-looking goal with named steps) and NOT type=action (it's bigger than one task — batching and dedup are two separate actions that could each attach under this plan node later).

Example: plan vs. idea — the other boundary plan gets confused with (a real miscall seen in production: a plan-shaped utterance got filed as idea).
Utterance: "What I want to do is set up the database first, then wire up auth, and once that's solid, start on the actual board UI."
Correct: new, type=plan, title="Sequence: database, then auth, then board UI", parent=whatever topic prompted it. NOT type=idea — this isn't a single proposal, it's a multi-step direction toward a goal (three named steps in sequence). A same-subject utterance like "maybe we set up the database first" with no further steps/target IS just an idea — the test is whether there's a sequence/target, not just a proposal being made.

Example: decision vs. update — a status report is NOT a decision.
Utterance: "So we've fixed two issues from before — the meeting bot wasn't joining, that's fixed now, and we've also changed the avatar so it shows when it's listening."
Correct decisions (all update, not decision):
1. new, type=update, title="Bot-not-joining issue fixed", relation/parent per context
2. new, type=update, title="Avatar now shows listening state", relation/parent per context
Why update, not decision: nothing is being decided here — the speaker is reporting completed work/changes. Reserve "decision" for a live commitment ("let's fix the joining bug by switching providers"), not a recap of what already got done — that's update (or evidence specifically, if it's being used to back up some OTHER claim/decision/risk/question rather than just being logged on its own).

Example: "update" node type, and not letting a nearby node absorb it — a real production case (T1 T2 Changes Test session).
Existing node: id=n1 action "System connectivity test" (the session's opening node, already finalized).
Utterance: "We made some changes on T1 classification and T2 classification. However, there was no node that appeared for that, which is odd."
WRONG (what actually happened, before "update" existed as a type): this got "expand"-folded into n1's summary — an unrelated "testing connectivity" node — repeating the umbrella-absorption pattern from the example above, just with the session's opening node acting as the umbrella instead of a topic node. The speaker then had to point out live that no node appeared for it.
Correct: TWO decisions — (1) new, type=update, title="Changed T1 and T2 classification", summarizing what was reported changed, parent=n1 or independent (whichever fits — this is a genuinely new, specific, nameable statement, not a detail about connectivity testing); (2) new, type=risk (or evidence), title="No node appeared for the T1/T2 change report", capturing the bug being observed live as its own distinct point. A report of a specific change is exactly the kind of new, distinct content the enumeration and OVER-EXPANDING rules already call for — "update" now gives it an unambiguous type so it isn't left to drift into whatever node happens to be open.

Example: a trailing "we should also" is usually a continuation, not an independent branch.
Existing nodes: id=t1 topic "Fixing today's bugs", id=e1 evidence "Real-time transcripts now working" (parent t1).
Utterance: "That's amazing — I think we should also make the board a bit more interactive so it feels like something's happening."
Correct: new, type=idea, title="Make the board more interactive", parent=e1 (or t1), relation="leads_to". The word "also" signals this is an addition to the SAME live conversation (a wrap-up thought prompted by what was just said), not a pivot to an unrelated subject — don't send it to "independent" just because the specific topic label (interactivity vs. bug-fixing) differs. Independent is for a genuine hard pivot ("switching gears entirely", "on a totally different note"), not for the natural next thought in a flowing discussion.

Example: waffle vs. skip — both look like "nothing important" but only one has content worth a node.
"Okay, so—" / "right, right" / "let's see" → SKIP, pure filler, no node at all.
"Ha, sorry, my coffee's gone cold, one sec" → WAFFLE — there's an actual remark with content (coffee, a pause), just no analytical weight. Give it a waffle node so the transcript has a placeholder there, don't silently drop it like true filler.
"Not sure this is even useful to bring up, but whatever, we should probably think about pricing at some point" → this one is NOT waffle despite the hedging — "we should think about pricing" is a real idea/topic under all the self-deprecation. Classify the substance (idea or topic), don't let the hedge language downgrade it to waffle.

Example: don't default-attach to the most recent node just because it's most recent.
Existing nodes in creation order: id=a1 idea "Redesign the onboarding flow", id=a2 risk "Engineering capacity is tight this quarter" (parent a1).
Utterance: "Also, we should get design's input on the new pricing page before launch."
Correct: new, type=idea, title="Get design input on pricing page", parent="independent" (or connects to a pricing topic if one exists) — this is about PRICING, not onboarding or engineering capacity, so it must NOT parent to a2 (the most recent node) just because it came right after it in the transcript. Judge relevance by subject matter, never by recency alone — this was a real bug in an earlier version of this classifier.

Example: a harder multi-item utterance where siblings AND a cross-branch reference both appear in one turn.
Existing nodes: id=t1 topic "Two project ideas to explore", id=i1 idea "UGC platform idea" (parent t1), id=i2 idea "Search engine idea" (parent t1).
Utterance: "Okay so for the UGC platform there are two open questions — do we allow anonymous posting, and how do we handle moderation at launch — and separately, on the search engine side, we still haven't picked a name."
Correct decisions (all for this one utterance):
1. new, type=question, temp_id="q1", title="Allow anonymous posting?", parent=i1 (UGC platform, not the topic, not search engine), relation="expands"
2. new, type=question, temp_id="q2", title="Moderation approach at launch", parent=i1, relation="expands"
3. new, type=question, temp_id="q3", title="Pick a name for search engine", parent=i2 (the OTHER idea — "separately, on the search engine side" is an explicit subject switch back to i2, not a sibling of q1/q2 under i1)
WRONG: parenting q3 to q1 or q2 just because they were emitted in the same response, or parenting all three questions to t1 instead of the specific idea each one is actually about. Read the utterance's own signposting ("separately, on the X side") — it tells you exactly when the subject shifts between existing branches, even within one utterance.`;

// Volatile per-call data goes AFTER the cached prefix (in the user message).
function buildUserPrompt(
  sessionType: string,
  openList: { id: string; type: string; title: string; summary: string }[],
  batch: { id: string; speaker_label?: string; text: string }[],
  context: { speaker_label?: string; text: string }[],
  provisionalGuesses: Record<string, { type: string; title: string }>,
) {
  const nodesBlock = openList.length
    ? JSON.stringify(openList, null, 1)
    : "none yet";
  const contextBlock = context.length
    ? context.map((u) => `[${u.speaker_label || "Speaker"}]: ${u.text}`).join("\n")
    : "none";
  const utterancesBlock = batch
    .map((u, i) => {
      const guess = provisionalGuesses[u.id];
      const guessNote = guess
        ? ` (already showing on the board as a live guess: ${guess.type} — "${guess.title}")`
        : "";
      return `${i}. [${u.speaker_label || "Speaker"}]: ${u.text}${guessNote}`;
    })
    .join("\n");

  return `Session mode: ${sessionType === "meeting" ? "meeting" : "personal"}

Existing nodes in this session (id, type, title, summary):
${nodesBlock}

Recent prior utterances (context only — already handled, do NOT reclassify these; use them to tell whether a NEW utterance is continuing a thought from just before a pause vs starting fresh):
${contextBlock}

New utterances to classify now (utterance_index, speaker, text):
${utterancesBlock}

Classify each new utterance using the record_classification tool. Remember: one utterance can produce several decisions when it names several distinct things — don't compress enumerated items into one node.`;
}

// The tool's input_schema is the structured response contract (formerly the
// InvokeLLM response_json_schema). It's static, so it's part of the cache.
const CLASSIFY_TOOL = {
  name: "record_classification",
  description:
    "Record one or more classification decisions per utterance, and any edges between nodes.",
  input_schema: {
    type: "object" as const,
    properties: {
      decisions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            utterance_index: {
              type: "integer",
              description: "Which utterance (from the numbered list) this decision is about. Multiple decisions may share the same utterance_index.",
            },
            action: { type: "string", enum: ["skip", "new", "attach", "expand"] },
            type: { type: "string", enum: NODE_TYPES },
            title: { type: "string" },
            summary: { type: "string" },
            node_id: {
              type: "string",
              description: "For 'attach'/'expand' only: the id of the pre-existing node being referenced.",
            },
            confidence: { type: "number" },
            temp_id: {
              type: "string",
              description: "For 'new' only: a short id you invent (e.g. 't1'), unique within this response, so a LATER decision in this same response can set its parent to 'temp:<temp_id>'.",
            },
            parent: {
              type: "string",
              description:
                "For action 'new': an existing node's id, 'temp:<temp_id>' referencing a node created earlier in this same response, or 'independent' for a genuinely new root branch.",
            },
            relation: { type: "string", enum: RELATIONS },
          },
          required: ["utterance_index", "action"],
        },
      },
    },
    required: ["decisions"],
  },
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // `provisionals` maps utterance_id -> its own still-forming provisional
    // node id (mic-live sessions can now batch several finalized utterances
    // into one call — PLAN.md §1d batching — so more than one may arrive
    // provisional at once, each needing its OWN node finalized in place, not
    // just utterance 0). `provisional_node_id` (single) is still accepted for
    // backward compatibility with any in-flight client during a deploy.
    const { session_id, utterance_ids, provisional_node_id, provisionals } = await req.json();
    if (!session_id) {
      return Response.json({ error: "session_id is required" }, { status: 400 });
    }
    const provisionalMap: Record<string, string> = { ...(provisionals || {}) };
    if (provisional_node_id && Array.isArray(utterance_ids) && utterance_ids[0]) {
      provisionalMap[utterance_ids[0]] = provisional_node_id;
    }
    const consumedUtteranceIds = new Set<string>();

    // RLS scopes reads to the caller, so a foreign session comes back not-found
    const session = await base44.entities.Session.get(session_id);
    if (!session) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    // Live sessions (mic/bot still capturing) stay "active" — only the
    // import/wrap-up flow ("processing") transitions to complete here.
    const isLive = session.status === "active";

    // Candidate utterances: the specific ids the caller passed (live per-
    // utterance path — calls fire in parallel), or the next pending batch
    // (import/wrap-up path).
    let candidates;
    if (Array.isArray(utterance_ids) && utterance_ids.length) {
      candidates = await base44.entities.Utterance.filter(
        { session_id, processed: false },
        "start_ms",
        200,
      ).then((rows) => rows.filter((r) => utterance_ids.includes(r.id)));
    } else {
      candidates = await base44.entities.Utterance.filter(
        { session_id, processed: false },
        "start_ms",
        IMPORT_BATCH_SIZE,
      );
    }

    // Atomically CLAIM each candidate (compare-and-set processed false->true).
    // Only one concurrent call wins a given utterance, so parallel calls never
    // double-process or strand rows — this is the fix for the dropped-content
    // bug (PLAN.md "compute in parallel, commit in order").
    const batch = [];
    for (const u of candidates) {
      const claim = await base44.entities.Utterance.updateMany(
        { id: u.id, processed: false },
        { $set: { processed: true } },
      );
      if (claim.updated === 1) batch.push(u);
    }

    if (batch.length === 0) {
      if (!isLive && session.status !== "complete") {
        const remaining = await base44.entities.Utterance.filter(
          { session_id, processed: false },
          "start_ms",
          1,
        );
        if (remaining.length === 0) {
          await base44.entities.Session.update(session_id, {
            status: "complete",
            ended_at: new Date().toISOString(),
            billed_ms: await finalizeBilledMs(base44, session_id),
          });
        }
      }
      return Response.json({ done: true, created: 0, processed: 0 });
    }

    // Quota backstop: utterances in this batch are already claimed (spoken/
    // pasted content is what's being billed, not node output), but skip the
    // paid classification call once the owner is over their monthly minutes
    // — this is the real cost control, since the pre-create checkQuota calls
    // (check-quota, recall-start-bot) only gate NEW sessions, not an
    // already-running one that crosses the line mid-session.
    const quota = await checkQuota(base44, user, session.type === "meeting" ? "meeting" : "personal");
    if (!quota.allowed) {
      base44.entities.UsageEvent.create({
        user_id: user.id,
        event_type: "plan_limit_hit",
        meta: { session_id, reason: quota.reason },
      }).catch(() => {});
      return Response.json({ done: false, created: 0, processed: batch.length, quota_exceeded: true });
    }

    // Read node context AFTER claiming, so we see the latest board. Hidden
    // nodes are excluded as re-attach targets (deliberately hidden) but still
    // count for placement offset.
    const existingNodes = await base44.entities.Node.filter(
      { session_id },
      "created_date",
      200,
    );

    // Sliding-window context: the last ~3 utterances just BEFORE this batch, so
    // a thought that continues across a pause isn't misread as unrelated.
    const batchStartMs = Math.min(...batch.map((u) => u.start_ms ?? 0));
    const recentUtts = await base44.entities.Utterance.filter(
      { session_id },
      "-start_ms",
      16,
    );
    const contextUtts = recentUtts
      .filter(
        (u) =>
          (u.start_ms ?? 0) < batchStartMs && !batch.some((b) => b.id === u.id),
      )
      .sort((a, b) => (a.start_ms ?? 0) - (b.start_ms ?? 0))
      .slice(-3);
    // Exclude hidden AND still-forming (provisional) nodes: a placeholder isn't
    // a stable attach target, and crucially the node we're finalizing this turn
    // must not be offered back to the classifier as something to attach to.
    const visibleNodes = existingNodes.filter((n) => !n.hidden && !n.provisional);
    const recentIds = new Set(visibleNodes.slice(-OPEN_LIST_RECENCY).map((n) => n.id));
    const keepIds = new Set(
      visibleNodes
        .filter((n) => n.type === "topic" || n.status === "open")
        .map((n) => n.id),
    );
    for (const id of recentIds) keepIds.add(id);
    const openList = visibleNodes
      .filter((n) => keepIds.has(n.id))
      .map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        summary: (n.summary || "").slice(0, 160),
      }));

    // Collision-resistant seq: derived from each op's utterance start_ms so ops
    // sort by speech order and concurrent calls (different utterances) never
    // collide — no shared counter to race on.
    let opCounter = 0;
    const appendOp = (
      op_type: string,
      payload: Record<string, unknown>,
      baseMs: number,
    ) =>
      base44.entities.SessionOp.create({
        session_id,
        seq: Math.round(baseMs) * 1000 + opCounter++,
        op_type,
        payload,
        owner_email: session.owner_email || undefined,
      });

    // Skip obvious filler before it ever reaches the model — classifyIdx maps
    // positions in the (possibly smaller) list actually sent to the model
    // back to positions in `batch`, so decisions still resolve to the right
    // utterance below.
    const classifyBatch: typeof batch = [];
    const classifyIdx: number[] = [];
    for (let i = 0; i < batch.length; i++) {
      if (isPureFiller(batch[i].text)) continue;
      classifyBatch.push(batch[i]);
      classifyIdx.push(i);
    }

    // Let the model see what's already showing on the board for utterances
    // that have a live Stage-2 guess (only real analytical/waffle guesses —
    // a still-raw "waffle" placeholder from Stage 1 alone isn't a meaningful
    // guess worth mentioning) — so it can weigh "this is already visible"
    // when choosing new vs. expand, instead of flying blind on that (PLAN.md).
    const provisionalGuesses: Record<string, { type: string; title: string }> = {};
    for (const [uttId, provId] of Object.entries(provisionalMap)) {
      const provNode = existingNodes.find((n) => n.id === provId);
      if (provNode && provNode.type !== "waffle") {
        provisionalGuesses[uttId] = { type: provNode.type, title: provNode.title };
      }
    }

    let result: { decisions?: Record<string, unknown>[] } = { decisions: [] };
    if (classifyBatch.length) {
      try {
        // Provider/model for this tier come from LlmConfig if an admin has
        // activated one (Admin > Config > LLM models); otherwise this is the
        // same direct Anthropic Haiku call as before (shared/llm.ts).
        const { data, costUsd } = await classifyForTier({
          base44,
          tier: "t1",
          defaultModel: TIER1_MODEL,
          system: TIER1_SYSTEM,
          user: buildUserPrompt(session.type, openList, classifyBatch, contextUtts, provisionalGuesses),
          tool: CLASSIFY_TOOL,
        });
        result = data;
        if (costUsd > 0) {
          // Awaited, not fire-and-forget — see consolidate-session's comment
          // on the same pattern; an un-awaited write here can lose the race
          // against the function's own return.
          await base44.entities.Session.updateMany(
            { id: session_id },
            { $inc: { llm_cost_usd: costUsd } },
          ).catch(() => {});
        }
      } catch (err) {
        // Release the claims so a retry can pick these utterances back up.
        for (const u of batch) {
          await base44.entities.Utterance.updateMany(
            { id: u.id },
            { $set: { processed: false } },
          ).catch(() => {});
        }
        throw err;
      }
    }

    let created = 0;
    const links: { node_id: string; utterance_id: string }[] = [];
    const events: Record<string, unknown>[] = [];
    // Map the model's own invented temp_id -> created node id, so a LATER
    // decision in this same response can parent to a node created by an
    // EARLIER decision — even when both decisions share the same utterance
    // (this is what makes "one utterance, several named items" work: each
    // item gets its own temp_id, and siblings/children reference each other
    // by temp_id rather than by utterance position).
    const newNodeByTempId = new Map<string, string>();

    // Running layout state: every visible node's position + parent, plus new
    // ones as they're created this turn. Drives the connected-flow tree layout.
    const placed: Placed[] = visibleNodes
      .filter((n) => typeof n.position_x === "number")
      .map((n) => ({
        id: n.id,
        x: n.position_x,
        y: n.position_y ?? ROOT_Y,
        parent_id: n.parent_id ?? null,
      }));

    // Resolve a parent ref ("temp:<id>" from earlier this response, or an
    // existing node id) to a real node id that's placed this turn or already
    // on the board. "independent"/empty/unresolvable all return null (root).
    const resolveParent = (ref: unknown): string | null => {
      if (typeof ref !== "string" || !ref) return null;
      const asTemp = ref.startsWith("temp:")
        ? newNodeByTempId.get(ref.slice(5))
        : newNodeByTempId.get(ref); // tolerate a bare temp_id without the prefix
      if (asTemp && placed.some((p) => p.id === asTemp)) return asTemp;
      return placed.some((p) => p.id === ref) ? ref : null;
    };

    let edgesCreated = 0;

    for (const d of result?.decisions ?? []) {
      // d.utterance_index refers to a position in classifyBatch (what the
      // model actually saw), not `batch` directly — remap through classifyIdx.
      const origIdx = classifyIdx[d.utterance_index];
      const utt = origIdx !== undefined ? batch[origIdx] : undefined;
      if (!utt || d.action === "skip") continue;
      const baseMs = utt.start_ms ?? Date.now();

      if (d.action === "new" && d.type && NODE_TYPES.includes(d.type) && d.title) {
        // Respect the model's three-way choice: a resolved parent connects the
        // node; "independent"/empty/unresolvable means a genuine new root
        // branch. No blind attach-to-most-recent — that force-connected
        // unrelated thoughts and broke the "separate idea" behavior (PLAN.md).
        const parentId = resolveParent(d.parent);
        const relation = RELATIONS.includes(d.relation) ? d.relation : "leads_to";
        const placement = placeNode(placed, parentId);
        const fields = {
          type: d.type,
          title: d.title.slice(0, 90),
          summary: (d.summary || "").slice(0, 600),
          status: OPEN_STATUS_TYPES.has(d.type) ? "open" : "na",
          confidence: typeof d.confidence === "number" ? d.confidence : undefined,
          parent_id: parentId || undefined,
          provisional: false,
          ...placement,
        };
        // Stage 3: if a provisional node was forming for THIS utterance, finalize
        // it IN PLACE (same record) instead of creating a new one — position,
        // connections and animations stay stable (PLAN.md provisional nodes).
        // Only the FIRST new-node decision for a given utterance claims its
        // provisional node; additional decisions from a multi-item utterance
        // create fresh nodes. A batched call can carry several utterances,
        // each with its OWN provisional node (see provisionalMap above).
        const uttProvisionalId = provisionalMap[utt.id];
        let node;
        if (uttProvisionalId && !consumedUtteranceIds.has(utt.id)) {
          consumedUtteranceIds.add(utt.id);
          await base44.entities.Node.update(uttProvisionalId, fields);
          node = { id: uttProvisionalId, session_id, owner_user_id: user.id, ...fields };
          await appendOp("update_node", { node_id: uttProvisionalId, patch: fields, node }, baseMs);
        } else {
          node = await base44.entities.Node.create({
            owner_user_id: user.id,
            session_id,
            owner_email: session.owner_email || undefined,
            ...fields,
          });
          await appendOp("create_node", { node }, baseMs);
        }
        if (d.temp_id) newNodeByTempId.set(String(d.temp_id), node.id);
        placed.push({
          id: node.id,
          x: placement.position_x,
          y: placement.position_y,
          parent_id: parentId,
        });
        created++;
        // (create_node / update_node op already emitted above.)
        // Draw the connector from parent to child, live
        if (parentId) {
          const edge = await base44.entities.NodeEdge.create({
            from_node_id: parentId,
            to_node_id: node.id,
            relation,
            cross_session: false,
            owner_email: session.owner_email || undefined,
          });
          await appendOp("create_edge", { edge }, baseMs);
          edgesCreated++;
        }
        links.push({ node_id: node.id, utterance_id: utt.id, owner_email: session.owner_email || undefined });
        events.push({
          user_id: user.id,
          event_type: "node_created",
          meta: { session_id, node_id: node.id, type: d.type },
        });
      } else if ((d.action === "attach" || d.action === "expand") && d.node_id) {
        const target = visibleNodes.find((n) => n.id === d.node_id);
        if (!target) continue;
        // A completed trailing clause can replace a placeholder title, not
        // just the summary (see TRAILING CLAUSE rule) — only when the model
        // actually supplied one, so a plain refinement's title stays put.
        if (d.action === "expand" && (d.summary || d.title)) {
          const patch: Record<string, unknown> = {};
          if (d.summary) patch.summary = d.summary.slice(0, 600);
          if (d.title) patch.title = d.title.slice(0, 90);
          await base44.entities.Node.update(target.id, patch);
        }
        await appendOp("attach_node", {
          node_id: target.id,
          utterance_id: utt.id,
          action: d.action,
          summary: d.action === "expand" ? d.summary?.slice(0, 600) : undefined,
          title: d.action === "expand" ? d.title?.slice(0, 90) : undefined,
        }, baseMs);
        links.push({ node_id: target.id, utterance_id: utt.id });
        events.push({
          user_id: user.id,
          event_type: "node_linked",
          meta: { session_id, node_id: target.id, action: d.action },
        });
      }
    }

    // False start: a provisional node was forming but its utterance turned out
    // to be filler or got folded into an existing node (whether the model said
    // so, or the pre-filter above never sent it to the model at all) — remove
    // it so the board doesn't keep a stray placeholder. Loops over every
    // provisional in this batch, not just one, now that a batch can cover
    // several utterances each with their own forming node.
    for (const [uttId, provId] of Object.entries(provisionalMap)) {
      if (consumedUtteranceIds.has(uttId)) continue;
      await base44.entities.Node.update(provId, { hidden: true }).catch(() => {});
      const srcUtt = batch.find((u) => u.id === uttId);
      await appendOp("hide_node", { node_id: provId }, srcUtt?.start_ms ?? batch[0]?.start_ms ?? Date.now());
    }

    // Utterances were already claimed (processed=true) up front; here we just
    // write the derived links + usage events.
    await Promise.all([
      links.length ? base44.entities.NodeUtteranceLink.bulkCreate(links) : null,
      events.length ? base44.entities.UsageEvent.bulkCreate(events) : null,
    ]);

    const nextPending = await base44.entities.Utterance.filter(
      { session_id, processed: false },
      "start_ms",
      1,
    );
    const done = nextPending.length === 0;
    if (done && !isLive) {
      await base44.entities.Session.update(session_id, {
        status: "complete",
        ended_at: new Date().toISOString(),
        billed_ms: await finalizeBilledMs(base44, session_id),
      });
    }

    return Response.json({ done, created, edges: edgesCreated, processed: batch.length });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
