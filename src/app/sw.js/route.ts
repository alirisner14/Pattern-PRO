// The service worker. It's a route (not a static file) so the build id can be
// baked in: every deploy changes these bytes, which is how installed copies
// find out there's a new version.
export const dynamic = "force-static";

const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

// String.raw keeps the regex backslashes exactly as written.
const script = String.raw`
const CACHE = "pattern-pro-__BUILD_ID__";
const CORE = [
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

// Pull every build asset a document or stylesheet points at.
function scan(text, base, found) {
  for (const m of text.matchAll(/\/_next\/static\/[^"'\\\s)<>]+/g)) found.add(m[0]);
  for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
    try {
      const u = new URL(m[1], base);
      if (u.origin === location.origin && u.pathname.startsWith("/_next/static/")) {
        found.add(u.pathname + u.search);
      }
    } catch (e) {}
  }
}

// Save the whole app so it opens and works with no connection. The page must
// succeed; individual assets are best-effort and are also saved as they load.
async function precache() {
  const cache = await caches.open(CACHE);
  const page = await fetch("/", { cache: "reload" });
  if (!page.ok) throw new Error("page unavailable");
  const html = await page.clone().text();
  await cache.put("/", page);

  const found = new Set();
  scan(html, location.origin + "/", found);
  const queue = [...CORE, ...found];
  const done = new Set();
  while (queue.length) {
    const url = queue.shift();
    if (done.has(url)) continue;
    done.add(url);
    try {
      const res = await fetch(url, { cache: "reload" });
      if (!res.ok) continue;
      await cache.put(url, res.clone());
      if (url.split("?")[0].endsWith(".css")) {
        const more = new Set();
        scan(await res.text(), new URL(url, location.origin).href, more);
        for (const u of more) if (!done.has(u)) queue.push(u);
      }
    } catch (e) {}
  }
}

// No skipWaiting here: a new version waits until the person taps the update
// banner, so it never swaps in mid-work.
self.addEventListener("install", (event) => event.waitUntil(precache()));

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("pattern-pro-") && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

async function respond(request, url) {
  const cache = await caches.open(CACHE);
  // One page serves every navigation.
  if (request.mode === "navigate") {
    const page = await cache.match("/");
    if (page) return page;
    return fetch(request);
  }
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"))) {
    cache.put(request, res.clone());
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin || url.pathname === "/sw.js") return;
  event.respondWith(respond(request, url));
});
`.replace("__BUILD_ID__", BUILD_ID);

export function GET() {
  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}
