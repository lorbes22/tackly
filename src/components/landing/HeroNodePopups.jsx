import { NodeCard } from "@/components/NodeCard";

// A slow, continuous arc marquee behind the hero — cards drift along a dome
// path, fading almost out of sight as they pass behind the headline/subhead
// and brightening again once they're clear of the text on either side.
// Hidden below lg: no room for this without colliding with the text.
const CARDS = [
  { type: "waffle", title: "Tackly is great", summary: "10x better than boring old transcripts.", delay: "-0s" },
  { type: "topic", title: "Why we built it", summary: null, delay: "-4.6s" },
  { type: "idea", title: "What if you could just talk?", summary: null, delay: "-9.2s" },
  { type: "question", title: "Does it work solo, not just meetings?", summary: null, delay: "-13.8s" },
  { type: "decision", title: "Yes — solo, meetings, or a transcript", summary: "Same map, either way.", delay: "-18.4s" },
];

export function HeroNodePopups() {
  return (
    <div className="absolute inset-0 hidden lg:block" aria-hidden="true">
      {CARDS.map((c) => (
        <div key={c.title} className="hero-arc-node w-32" style={{ animationDelay: c.delay }}>
          <NodeCard
            node={{ type: c.type, title: c.title, summary: c.summary, rotation_deg: 0, status: "na" }}
          />
        </div>
      ))}
    </div>
  );
}
