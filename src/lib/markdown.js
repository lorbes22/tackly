import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ breaks: true, gfm: true });

// Shared by the article editor's live preview and the public article page,
// so what an admin sees while writing matches what actually ships.
export function renderMarkdown(source) {
  const html = marked.parse(source || "");
  return DOMPurify.sanitize(html);
}
