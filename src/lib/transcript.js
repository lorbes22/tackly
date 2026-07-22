// Parse a pasted/uploaded transcript into utterance objects.
// Handles "Speaker: text" lines, plain paragraphs, and VTT/SRT noise.

const SPEAKER_RE = /^\s*([A-Za-z][A-Za-z0-9 ._'-]{0,38}?)\s*[:—]\s+(.+)$/;
const TIMESTAMP_RE = /^\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]?\d*\s*(-->|$)/;
const NOISE_RE = /^\s*(WEBVTT|NOTE\b|\d+\s*$)/;

export function parseTranscript(raw) {
  const utterances = [];
  let lastSpeaker = null;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || TIMESTAMP_RE.test(trimmed) || NOISE_RE.test(trimmed)) continue;

    const match = trimmed.match(SPEAKER_RE);
    if (match) {
      lastSpeaker = match[1].trim();
      utterances.push({ speaker_label: lastSpeaker, text: match[2].trim() });
    } else if (
      utterances.length > 0 &&
      lastSpeaker &&
      utterances[utterances.length - 1].speaker_label === lastSpeaker &&
      trimmed.length < 200 &&
      !/[.!?]$/.test(utterances[utterances.length - 1].text)
    ) {
      // Continuation of a wrapped line from the same speaker
      utterances[utterances.length - 1].text += " " + trimmed;
    } else {
      utterances.push({ speaker_label: lastSpeaker, text: trimmed });
    }
  }

  return utterances.map((u, i) => ({
    ...u,
    start_ms: i * 1000,
    end_ms: i * 1000 + 999,
    finalized: true,
    processed: false,
  }));
}
