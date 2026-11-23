import { useMemo } from "react";
import DOMPurify from "dompurify";
import renderMathInElement from "katex/contrib/auto-render";
import "katex/dist/katex.min.css";
import type { DemoCard } from "../demoSubjects";
import { Markdown } from "../markdown";
export const MATH_DELIMITERS = [
  { left: "$$", right: "$$", display: true },
  { left: "\\[", right: "\\]", display: true },
  { left: "\\(", right: "\\)", display: false },
  { left: "$", right: "$", display: false },
];
export function hasMath(text: string) {
  return /\\\(|\\\[|\$[^$]+\$/.test(text);
}
export function sanitizeAnki(
  text: string,
  media: Record<string, string> = {},
): string {
  // Rewrite image URLs inside the inert sanitizer document, before parsing into
  // a live document can initiate any remote image request.
  DOMPurify.addHook('afterSanitizeAttributes', node => {
    if (node.nodeName !== 'IMG') return;
    const raw = node.getAttribute('src') ?? '';
    let key = raw;
    try { key = decodeURIComponent(raw); } catch { /* retain original filename */ }
    const src = Object.hasOwn(media, key) ? media[key] : undefined;
    if (typeof src === 'string' && src.startsWith('blob:')) node.setAttribute('src', src);
    else node.remove();
  });
  let html: string;
  try {
  html = DOMPurify.sanitize(text, {
    ALLOWED_TAGS: [
      "b",
      "i",
      "u",
      "em",
      "strong",
      "br",
      "p",
      "div",
      "span",
      "ul",
      "ol",
      "li",
      "sub",
      "sup",
      "code",
      "pre",
      "table",
      "thead",
      "tbody",
      "tfoot",
      "tr",
      "td",
      "th",
      "img",
      "a",
    ],
    ALLOWED_ATTR: ["href", "src", "alt", "title", "colspan", "rowspan"],
    ALLOW_DATA_ATTR: false,
  });
  } finally { DOMPurify.removeHook('afterSanitizeAttributes'); }
  const holder = document.createElement("div");
  holder.innerHTML = html;
  for (const a of Array.from(holder.querySelectorAll("a"))) {
    if (!/^https:\/\//i.test(a.getAttribute("href") ?? ""))
      a.removeAttribute("href");
    else {
      a.setAttribute("rel", "noopener noreferrer");
      a.setAttribute("target", "_blank");
    }
  }
  return holder.innerHTML;
}
export function sourceUrl(source: string): string | undefined {
  const text = document.createElement("div");
  text.innerHTML = DOMPurify.sanitize(source, {
    ALLOWED_TAGS: ["a"],
    ALLOWED_ATTR: ["href"],
    ALLOWED_URI_REGEXP: /^(?:obsidian:\/\/|https:\/\/)/i,
  });
  const candidate =
    text.querySelector("a")?.getAttribute("href") ??
    text.textContent?.trim() ??
    "";
  return /^(obsidian:\/\/|https:\/\/)/i.test(candidate) ? candidate : undefined;
}
export function CardContent({
  card,
  side,
  media = {},
}: {
  card: DemoCard;
  side: "front" | "back";
  media?: Record<string, string>;
}) {
  const text = card[side];
  const html = useMemo(() => {
    if (card.format !== "anki") return "";
    const holder = document.createElement("div");
    holder.innerHTML = sanitizeAnki(text, media);
    renderMathInElement(holder, {
      delimiters: MATH_DELIMITERS,
      throwOnError: false,
      trust: false,
      strict: "ignore",
    });
    return holder.innerHTML;
  }, [text, card.format, media]);
  const url =
    card.source && side === "back" ? sourceUrl(card.source) : undefined;
  return (
    <>
      {card.format === "anki" ? (
        <div
          className="anki-content"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <Markdown text={text} />
      )}
      {url && (
        <a
          className="source-link"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open source
        </a>
      )}
    </>
  );
}
