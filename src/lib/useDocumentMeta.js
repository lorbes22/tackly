import { useEffect } from "react";

function setMeta(name, content, attr = "name") {
  if (!content) return;
  let tag = document.head.querySelector(`meta[${attr}="${name}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, name);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

// Lightweight per-page <title>/<meta> control for this single-page app —
// no react-helmet dependency, just direct DOM writes on mount, restored to
// the previous values on unmount so route changes don't leak into each other.
export function useDocumentMeta({ title, description }) {
  useEffect(() => {
    const prevTitle = document.title;
    if (title) document.title = title;
    if (description) setMeta("description", description);
    if (title) setMeta("og:title", title, "property");
    if (description) setMeta("og:description", description, "property");
    return () => {
      document.title = prevTitle;
    };
  }, [title, description]);
}
