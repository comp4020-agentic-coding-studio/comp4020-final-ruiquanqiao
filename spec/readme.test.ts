import { JSDOM } from "jsdom";
import { expect, inject, it } from "vitest";

// A marker starts at /readme/ and follows its links. Every page reachable from
// it inside the site must answer as a page, not a download or a 404: a link
// into client/public/assets/ASSETS.md was dead on the deployed app for weeks
// and nothing noticed, because nothing followed it.
const baseUrl = inject("baseUrl");

it("serves every page /readme/ links to, and every page those link to, as HTML", async () => {
  const seen = new Set<string>();
  const queue = ["/readme/"];
  const broken: string[] = [];
  while (queue.length > 0) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    const res = await fetch(new URL(path, baseUrl));
    const type = res.headers.get("content-type") ?? "";
    if (res.status !== 200 || !type.startsWith("text/html")) {
      broken.push(`${path} → ${res.status} ${type}`);
      continue;
    }
    const doc = new JSDOM(await res.text(), { url: new URL(path, baseUrl).href }).window.document;
    for (const a of doc.querySelectorAll("a[href]")) {
      const target = new URL((a as HTMLAnchorElement).href);
      if (target.origin !== new URL(baseUrl).origin || !target.pathname.startsWith("/readme/")) continue;
      queue.push(target.pathname);
    }
  }
  expect(broken).toEqual([]);
  expect(seen.size, "the crawl found none of the docs the README links to").toBeGreaterThan(5);
});
