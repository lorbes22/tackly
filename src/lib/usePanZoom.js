import { useCallback, useEffect, useRef, useState } from "react";

// Pan/zoom for the board. Pan by dragging empty canvas (mouse or single-finger
// touch); zoom with wheel/trackpad-pinch on desktop, or two-finger pinch on
// touch. Bounded to the content's bounding box plus padding rather than an
// infinite plane, so you can't lose the map off-screen.
//
// Mouse and touch both go through the same Pointer Events handlers — one
// active pointer pans, two active pointers pinch-zooms (distance ratio from
// the moment the second finger touches down, recomputed fresh each gesture
// rather than accumulated incrementally, so there's no drift). Lifting back
// down to one finger resumes a plain pan from wherever that finger is.

const MIN_SCALE = 0.4;
const MAX_SCALE = 2;
const PAD = 400; // world-space padding around the content bbox

export function usePanZoom({ viewportRef, contentBounds }) {
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const transformRef = useRef(transform);
  transformRef.current = transform;
  const dragRef = useRef(null); // single-pointer pan: { startX, startY, orig }
  const pinchRef = useRef(null); // two-pointer pinch: { startDist, orig }
  const pointersRef = useRef(new Map()); // pointerId -> { x, y }
  const boundsRef = useRef(contentBounds);
  boundsRef.current = contentBounds;

  // Clamp so the padded content box always overlaps the viewport
  const clamp = useCallback((next) => {
    const vp = viewportRef.current;
    const b = boundsRef.current;
    if (!vp || !b) return next;
    const { scale } = next;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    const left = (b.minX - PAD) * scale;
    const right = (b.maxX + PAD) * scale;
    const top = (b.minY - PAD) * scale;
    const bottom = (b.maxY + PAD) * scale;
    let { x, y } = next;
    // Keep the padded box from leaving the viewport
    x = Math.min(-left, Math.max(vw - right, x));
    y = Math.min(-top, Math.max(vh - bottom, y));
    // If content is smaller than the viewport, center it on that axis
    if (right - left < vw) x = (vw - (left + right)) / 2;
    if (bottom - top < vh) y = (vh - (top + bottom)) / 2;
    return { ...next, x, y };
  }, [viewportRef]);

  const zoomAt = useCallback(
    (clientX, clientY, factor) => {
      const vp = viewportRef.current;
      if (!vp) return;
      const rect = vp.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      setTransform((t) => {
        const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, t.scale * factor));
        const k = scale / t.scale;
        // Keep the point under the cursor fixed
        return clamp({
          scale,
          x: px - (px - t.x) * k,
          y: py - (py - t.y) * k,
        });
      });
    },
    [viewportRef, clamp]
  );

  const beginPinch = useCallback(() => {
    const pts = Array.from(pointersRef.current.values());
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
    pinchRef.current = { startDist: dist, orig: transformRef.current };
    dragRef.current = null;
  }, []);

  const onPointerDown = useCallback(
    (e) => {
      // Only start a gesture on empty canvas (targets set data-pan-surface)
      if (!e.target.closest?.("[data-pan-surface]")) return;
      if (e.target.closest?.("[data-node]")) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      e.currentTarget.setPointerCapture?.(e.pointerId);

      if (pointersRef.current.size === 1) {
        dragRef.current = { startX: e.clientX, startY: e.clientY, orig: transformRef.current };
      } else if (pointersRef.current.size === 2) {
        beginPinch();
      }
      // A third+ finger is ignored — the gesture already in progress continues.
    },
    [beginPinch]
  );

  const onPointerMove = useCallback(
    (e) => {
      if (!pointersRef.current.has(e.pointerId)) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pinchRef.current && pointersRef.current.size >= 2) {
        const vp = viewportRef.current;
        if (!vp) return;
        const pts = Array.from(pointersRef.current.values()).slice(0, 2);
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        const rect = vp.getBoundingClientRect();
        const px = mid.x - rect.left;
        const py = mid.y - rect.top;
        const { startDist, orig } = pinchRef.current;
        const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, orig.scale * (dist / startDist)));
        const k = scale / orig.scale;
        setTransform(
          clamp({
            scale,
            x: px - (px - orig.x) * k,
            y: py - (py - orig.y) * k,
          })
        );
        return;
      }

      const d = dragRef.current;
      if (!d) return;
      setTransform(
        clamp({
          ...d.orig,
          x: d.orig.x + (e.clientX - d.startX),
          y: d.orig.y + (e.clientY - d.startY),
        })
      );
    },
    [clamp, viewportRef]
  );

  const endPointer = useCallback((e) => {
    pointersRef.current.delete(e.pointerId);
    e.currentTarget?.releasePointerCapture?.(e.pointerId);
    pinchRef.current = null;
    if (pointersRef.current.size === 1) {
      // One finger still down — resume a plain pan from where it is now,
      // rather than ending the whole gesture.
      const [remaining] = pointersRef.current.values();
      dragRef.current = { startX: remaining.x, startY: remaining.y, orig: transformRef.current };
    } else {
      dragRef.current = null;
    }
  }, []);

  // Wheel: ctrl/cmd or pinch → zoom; otherwise pan
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
      } else {
        setTransform((t) => clamp({ ...t, x: t.x - e.deltaX, y: t.y - e.deltaY }));
      }
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [viewportRef, zoomAt, clamp]);

  const zoomBy = useCallback(
    (factor) => {
      const vp = viewportRef.current;
      if (!vp) return;
      const rect = vp.getBoundingClientRect();
      zoomAt(rect.left + vp.clientWidth / 2, rect.top + vp.clientHeight / 2, factor);
    },
    [viewportRef, zoomAt]
  );

  // Fit the whole content box into the viewport
  const fitToContent = useCallback(() => {
    const vp = viewportRef.current;
    const b = boundsRef.current;
    if (!vp || !b) return;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    const cw = b.maxX - b.minX + PAD;
    const ch = b.maxY - b.minY + PAD;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(vw / cw, vh / ch)));
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    setTransform(
      clamp({ scale, x: vw / 2 - cx * scale, y: vh / 2 - cy * scale })
    );
  }, [viewportRef, clamp]);

  // Shift the current pan by a fixed screen-space amount, keeping scale as-is
  // — used for the board's "nudge into view" auto-follow rather than a hard
  // re-center, so it never fights a manual pan/zoom the user already did.
  const nudgeBy = useCallback(
    (dx, dy) => {
      if (!dx && !dy) return;
      setTransform((t) => clamp({ ...t, x: t.x + dx, y: t.y + dy }));
    },
    [clamp]
  );

  // Smoothly bring a world-space point to the viewport center
  const panToWorld = useCallback(
    (wx, wy) => {
      const vp = viewportRef.current;
      if (!vp) return;
      setTransform((t) =>
        clamp({ ...t, x: vp.clientWidth / 2 - wx * t.scale, y: vp.clientHeight / 2 - wy * t.scale })
      );
    },
    [viewportRef, clamp]
  );

  return {
    transform,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPointer,
      onPointerLeave: endPointer,
      onPointerCancel: endPointer,
    },
    zoomBy,
    fitToContent,
    panToWorld,
    nudgeBy,
  };
}
