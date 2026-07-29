import { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { base44 } from "@/api/base44Client";

const Badge = base44.entities.Badge;

// Renders whatever embed snippets are currently enabled in
// Admin > Config (e.g. the Product Hunt "Featured" badge) above the hero
// heading. Sanitized before render since embed_html is raw third-party HTML,
// even though only an admin can write it.
export function Badges() {
  const [badges, setBadges] = useState([]);

  useEffect(() => {
    let cancelled = false;
    Badge.filter({ enabled: true }, "sort_order")
      .then((rows) => !cancelled && setBadges(rows))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (badges.length === 0) return null;

  return (
    <div className="mb-5 flex flex-wrap items-center justify-center gap-3">
      {badges.map((badge) => (
        <span
          key={badge.id}
          className="animate-fade-up inline-flex"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(badge.embed_html) }}
        />
      ))}
    </div>
  );
}
