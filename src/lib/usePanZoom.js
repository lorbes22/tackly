import { useCallback, useEffect, useRef, useState } from "react";

// Pan/zoom for the board. Pan by dragging empty canvas; zoom with wheel/pinch
// toward the cursor. Bounded to the content's bounding box plus padding rather
// than an infinite plane, so you can't lose the map off-screen.

const MIN_SCALE = 0.4;
const MAX_SCALE = 2;
const PAD = 400; // world-space padding around the content bbox

export function usePanZoom({ viewportRef, contentBounds }) {
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const transformRef = useRef(transform);
  transformRef.current = transform;
  const dragRef = useRef(null);
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

  const onPointerDown = useCallback((e) => {
    // Only start a pan on empty canvas (targets set data-pan-surface)
    if (!e.target.closest?.("[data-pan-surface]")) return;
    if (e.target.closest?.("[data-node]")) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, orig: transformRef.current };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e) => {
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
    [clamp]
  );

  const onPointerUp = useCallback((e) => {
    dragRef.current = null;
    e.currentTarget?.releasePointerCapture?.(e.pointerId);
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
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerLeave: onPointerUp },
    zoomBy,
    fitToContent,
    panToWorld,
  };
}
