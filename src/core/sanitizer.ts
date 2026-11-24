// Safe HTML & SVG Sanitization using native Sanitizer API with lazy DOMPurify fallback

let domPurifyPromise: Promise<typeof import('dompurify').default> | null = null;

function loadDOMPurify() {
  domPurifyPromise ??= import('dompurify').then((mod) => mod.default ?? (mod as unknown as typeof import('dompurify').default));
  return domPurifyPromise;
}

const ALLOWED_HTML_ELEMENTS = [
  'p',
  'br',
  'b',
  'i',
  'u',
  'strong',
  'em',
  'mark',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'hr',
  'a',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'span',
  'div',
];

const ALLOWED_HTML_ATTRS = ['class', 'href', 'title', 'target', 'rel'];

export async function safeSetHTML(el: Element, untrustedHtml: string): Promise<void> {
  if ('setHTML' in Element.prototype) {
    (el as Element & { setHTML: (html: string, opts?: unknown) => void }).setHTML(untrustedHtml, {
      sanitizer: { elements: ALLOWED_HTML_ELEMENTS, attributes: ALLOWED_HTML_ATTRS },
    });
    return;
  }
  const DOMPurify = await loadDOMPurify();
  el.innerHTML = DOMPurify.sanitize(untrustedHtml, {
    ALLOWED_TAGS: [...ALLOWED_HTML_ELEMENTS, '#text'],
    ALLOWED_ATTR: ALLOWED_HTML_ATTRS,
    ALLOW_ARIA_ATTR: false,
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: false,
  });
}

/**
 * Sanitizes uploaded custom SVG stickers strictly: strips scripts, foreignObject, event handlers, javascript: URLs.
 */
export async function sanitizeSvgMarkup(rawSvg: string): Promise<string> {
  const DOMPurify = await loadDOMPurify();
  return DOMPurify.sanitize(rawSvg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['script', 'foreignObject', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onmouseover', 'href', 'xlink:href'],
  });
}
