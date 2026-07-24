import { NodeCard } from "@/components/NodeCard";

// A slow, continuous arc marquee behind the hero — cards drift along a dome
// path, fading almost out of sight as they pass behind the headline/subhead
// and brightening again once they're clear of the text on either side.
// Shown at every size (smaller on mobile); the hover hand-off only really
// makes sense with a mouse, so touch sizes stay non-interactive.
const CARDS = [
  { type: "waffle", title: "Tackly is great", summary: "10x better than boring old transcripts.", delay: "-0s" },
  { type: "topic", title: "Why we built it", summary: null, delay: "-4.6s" },
  { type: "idea", title: "What if you could just talk?", summary: null, delay: "-9.2s" },
  { type: "question", title: "Does it work solo, not just meetings?", summary: null, delay: "-13.8s" },
  { type: "decision", title: "Yes — solo, meetings, or a transcript", summary: "Same map, either way.", delay: "-18.4s" },
];

export function HeroNodePopups() {
  return (
    // Fixed height, not inset-0/full-section: the section's own height
    // balloons on mobile once the headline wraps across more lines, and
    // since the arc's top/left are both percentages, a tall-but-narrow
    // container turned the dome into a sharp spike (big vertical swing,
    // small horizontal one). Pinning a sane height per breakpoint keeps
    // the same shallow-dome proportions everywhere.
    <div
      className="pointer-events-none absolute inset-x-0 top-0 h-[170px] sm:h-[240px] lg:h-[460px] lg:pointer-events-auto"
      aria-hidden="true"
    >
      {CARDS.map((c) => (
        // NodeCard has its own fixed width (w-56), so the actual on-screen
        // size only ever comes from the scale() in the hero-arc keyframe —
        // --arc-scale multiplies that per breakpoint (full size at lg,
        // shrunk well down on phones, where 5 full-size cards in a much
        // narrower dome read as an overlapping pile rather than an arc).
        <div
          key={c.title}
          className="hero-arc-node [--arc-scale:0.4] sm:[--arc-scale:0.55] lg:[--arc-scale:1]"
          style={{ animationDelay: c.delay }}
        >
          <NodeCard
            node={{ type: c.type, title: c.title, summary: c.summary, rotation_deg: 0, status: "na" }}
          />
        </div>
      ))}
    </div>
  );
}
