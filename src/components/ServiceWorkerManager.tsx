"use client";

import { useEffect, useState } from "react";

// Registers the offline service worker (production only, so development
// never gets stuck on a saved copy) and shows the "update available" banner.
export default function ServiceWorkerManager() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [offlineReady, setOfflineReady] = useState(false);

  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    )
      return;

    const hadController = !!navigator.serviceWorker.controller;
    let registration: ServiceWorkerRegistration | undefined;
    let timer: number | undefined;

    // The page reloads onto the new version only after the person taps
    // "Tap to update" (the controller changes once the waiting worker
    // takes over).
    const onControllerChange = () => {
      if (hadController) window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    const track = (worker: ServiceWorker | null) => {
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state !== "installed") return;
        if (navigator.serviceWorker.controller) setWaiting(worker);
        else setOfflineReady(true);
      });
    };

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        registration = reg;
        if (reg.waiting && navigator.serviceWorker.controller)
          setWaiting(reg.waiting);
        track(reg.installing);
        reg.addEventListener("updatefound", () => track(reg.installing));
        // Look for a new version now, whenever the app comes back to the
        // front, and hourly while it stays open.
        reg.update().catch(() => {});
        timer = window.setInterval(
          () => reg.update().catch(() => {}),
          60 * 60 * 1000,
        );
      })
      .catch(() => {});

    const onVisible = () => {
      if (document.visibilityState === "visible")
        registration?.update().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
      document.removeEventListener("visibilitychange", onVisible);
      if (timer) window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!offlineReady) return;
    const t = window.setTimeout(() => setOfflineReady(false), 6000);
    return () => window.clearTimeout(t);
  }, [offlineReady]);

  if (!waiting && !offlineReady) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-3 border-t border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
    >
      {waiting ? (
        <>
          <span>Update available.</span>
          <button
            onClick={() => waiting.postMessage({ type: "SKIP_WAITING" })}
            className="rounded-md bg-zinc-900 px-3 py-1.5 font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Tap to update
          </button>
          <button
            onClick={() => setWaiting(null)}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Later
          </button>
        </>
      ) : (
        <span>
          Saved for offline use. Pattern PRO now works without a connection.
        </span>
      )}
    </div>
  );
}
