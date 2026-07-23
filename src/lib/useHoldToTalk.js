import { useCallback, useEffect, useRef, useState } from "react";
import { StreamingTranscriber } from "assemblyai/streaming";
import { base44 } from "@/api/base44Client";

// Hold-to-talk capture. AssemblyAI bills for connection time, not speech
// time, so the WebSocket exists ONLY while the key is held: open on press,
// Terminate on release. Backups, layered per docs/assemblyai-agent-instructions.md:
// - inactivity_timeout 30s server-side (client crashes mid-hold)
// - max_session_duration_seconds 600 on the token (hard server ceiling)
// - pagehide/beforeunload best-effort close (tab closed mid-hold)
// Audio path: mic MediaStream -> AudioWorklet (resample to 16 kHz, Int16 PCM,
// 50 ms chunks) -> transcriber.sendAudio. Mirrors the SDK's own pcm16 encoder.

const workletSource = `
class TacklyPcm16Encoder extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.targetRate = opts.targetRate || 16000;
    this.ratio = sampleRate / this.targetRate;
    this.chunkSize = Math.round(this.targetRate * 50 / 1000);
    this.buffer = new Int16Array(this.chunkSize);
    this.bufferIdx = 0;
    this.lastSample = 0;
    this.fractional = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;
    const mono = input[0];
    let pos = this.fractional;
    while (pos < mono.length) {
      const i = Math.floor(pos);
      const frac = pos - i;
      const a = i === 0 ? this.lastSample : mono[i - 1];
      const b = mono[i];
      const sample = a + (b - a) * frac;
      const clamped = sample < -1 ? -1 : sample > 1 ? 1 : sample;
      this.buffer[this.bufferIdx++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      if (this.bufferIdx === this.chunkSize) {
        const out = new Int16Array(this.chunkSize);
        out.set(this.buffer);
        this.port.postMessage({ pcm: out.buffer }, [out.buffer]);
        this.bufferIdx = 0;
      }
      pos += this.ratio;
    }
    this.lastSample = mono[mono.length - 1];
    this.fractional = pos - mono.length;
    return true;
  }
}
registerProcessor("tackly-pcm16-encoder", TacklyPcm16Encoder);
`;

export function useHoldToTalk({ onFinalTurn, onPartial }) {
  const [state, setState] = useState("idle"); // idle | connecting | listening
  const [partial, setPartial] = useState("");
  const [error, setError] = useState("");

  const transcriberRef = useRef(null);
  const contextRef = useRef(null);
  const streamRef = useRef(null);
  const stoppingRef = useRef(false);
  const onFinalRef = useRef(onFinalTurn);
  onFinalRef.current = onFinalTurn;
  const onPartialRef = useRef(onPartial);
  onPartialRef.current = onPartial;

  const teardown = useCallback(async () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (contextRef.current && contextRef.current.state !== "closed") {
        await contextRef.current.close().catch(() => {});
      }
      contextRef.current = null;
      if (transcriberRef.current) {
        // Sends Terminate and waits for the server's Termination event
        await transcriberRef.current.close(true).catch(() => {});
        transcriberRef.current = null;
      }
    } finally {
      stoppingRef.current = false;
      setPartial("");
      setState("idle");
    }
  }, []);

  const startHold = useCallback(async () => {
    if (state !== "idle" || stoppingRef.current) return;
    setError("");
    setState("connecting");
    try {
      const res = await base44.functions.invoke("assemblyai-token");
      const token = res.data?.token;
      if (!token) throw new Error("Could not get a streaming token");

      const transcriber = new StreamingTranscriber({
        token,
        sampleRate: 16000,
        speechModel: "universal-3-5-pro",
        mode: "balanced",
        speakerLabels: true,
        // Server closes the session if audio stops flowing for 30s — the
        // backup for a client that crashes mid-hold and never Terminates.
        // Audio streams continuously during a hold, so this never fires
        // in normal use (no KeepAlive needed).
        inactivityTimeout: 30,
      });
      transcriber.on("turn", (turn) => {
        if (!turn.transcript) return;
        if (turn.end_of_turn) {
          setPartial("");
          onFinalRef.current?.(turn);
        } else {
          setPartial(turn.transcript);
          onPartialRef.current?.(turn.transcript);
        }
      });
      transcriber.on("error", (err) => {
        setError(err?.message || "Streaming error");
        teardown();
      });
      transcriberRef.current = transcriber;
      await transcriber.connect();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const context = new AudioContext();
      contextRef.current = context;
      const blobUrl = URL.createObjectURL(
        new Blob([workletSource], { type: "application/javascript" })
      );
      try {
        await context.audioWorklet.addModule(blobUrl);
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
      const source = context.createMediaStreamSource(stream);
      const encoder = new AudioWorkletNode(context, "tackly-pcm16-encoder", {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        channelCount: 1,
        channelCountMode: "explicit",
        processorOptions: { targetRate: 16000 },
      });
      encoder.port.onmessage = (e) => {
        try {
          transcriberRef.current?.sendAudio(e.data.pcm);
        } catch {
          // socket already closing — safe to drop the chunk
        }
      };
      source.connect(encoder);
      setState("listening");
    } catch (err) {
      setError(
        err?.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in your browser and try again."
          : err?.message || "Couldn't start listening"
      );
      await teardown();
    }
  }, [state, teardown]);

  const endHold = useCallback(() => {
    // Force the in-flight turn to finalize now, give it a beat to arrive,
    // then Terminate — release-to-Terminate stays well under a second.
    try {
      transcriberRef.current?.forceEndpoint();
    } catch {
      // socket already gone
    }
    setTimeout(() => teardown(), 500);
  }, [teardown]);

  // Terminate on unmount, whatever state we're in
  useEffect(() => () => {
    teardown();
  }, [teardown]);

  // Best-effort clean close if the tab is closed/navigated away mid-hold.
  // Fires the Terminate send synchronously; the server-side backups above
  // cover the case where it doesn't get through.
  useEffect(() => {
    const onLeave = () => {
      if (transcriberRef.current) teardown();
    };
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [teardown]);

  return { state, partial, error, startHold, endHold };
}
