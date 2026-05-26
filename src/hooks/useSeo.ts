import { useEffect } from "react";

interface SeoOptions {
  title?: string;
  description?: string;
  canonical?: string;
  noindex?: boolean;
  ogImage?: string;
}

const FALLBACK_ORIGIN = "https://tristatetags.com";
const DEFAULT_TITLE =
  "NJ Temporary Tags Same Day | TriStateTags — Licensed NJ Dealer";
const DEFAULT_DESCRIPTION =
  "Get your New Jersey temporary plate and registration the same day. NJ MVC licensed dealer. Instant email delivery, free 50-mile driver delivery, or +$33 overnight shipping. From $150.";

function getSiteOrigin(): string {
  if (typeof window === "undefined") return FALLBACK_ORIGIN;
  return window.location.origin || FALLBACK_ORIGIN;
}

function setMetaByName(name: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setMetaByProperty(property: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(
    `meta[property="${property}"]`,
  );
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setLinkRel(rel: string, href: string) {
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/**
 * Manage per-route SEO. Call once at the top of a page component.
 * Updates document title, description, canonical link, robots, and OG/Twitter meta.
 */
export function useSeo({
  title,
  description,
  canonical,
  noindex,
  ogImage,
}: SeoOptions) {
  useEffect(() => {
    const siteOrigin = getSiteOrigin();
    const finalTitle = title ?? DEFAULT_TITLE;
    const finalDescription = description ?? DEFAULT_DESCRIPTION;
    const finalCanonical = canonical
      ? canonical.startsWith("http")
        ? canonical
        : `${siteOrigin}${canonical.startsWith("/") ? "" : "/"}${canonical}`
      : `${siteOrigin}${window.location.pathname}`;
    const finalImage = ogImage ?? `${siteOrigin}/og-image.png`;

    document.title = finalTitle;
    setMetaByName("description", finalDescription);
    setLinkRel("canonical", finalCanonical);

    if (noindex) {
      setMetaByName("robots", "noindex, nofollow");
      setMetaByName("googlebot", "noindex, nofollow");
    } else {
      setMetaByName(
        "robots",
        "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
      );
      setMetaByName("googlebot", "index, follow");
    }

    setMetaByProperty("og:title", finalTitle);
    setMetaByProperty("og:description", finalDescription);
    setMetaByProperty("og:url", finalCanonical);
    setMetaByProperty("og:image", finalImage);
    setMetaByName("twitter:title", finalTitle);
    setMetaByName("twitter:description", finalDescription);
    setMetaByName("twitter:image", finalImage);
  }, [title, description, canonical, noindex, ogImage]);
}
