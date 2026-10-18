// Push subscription requires an activated worker, not merely a registered one.
export async function getActivePushRegistration(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register("/sw.js");
  if (registration.active?.state === "activated") return registration;

  const worker = registration.installing ?? registration.waiting ?? registration.active;
  if (!worker) throw new Error("Notification service could not start. Please try again.");

  await new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      worker.removeEventListener("statechange", checkState);
      if (error) reject(error);
      else resolve();
    };
    const checkState = () => {
      if (worker.state === "activated") finish();
      else if (worker.state === "redundant") {
        finish(new Error("Notification service could not activate. Please try again."));
      }
    };
    const timeout = setTimeout(() => {
      finish(new Error("Notification service took too long to start. Please try again."));
    }, 15000);
    worker.addEventListener("statechange", checkState);
    checkState();
  });
  return registration;
}

export function decodeVapidKey(base64Url: string): Uint8Array {
  const base64 = base64Url.trim().replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(
    atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")),
    (character) => character.charCodeAt(0),
  );
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array) {
  if (!a) return false;
  const left = new Uint8Array(a);
  return left.length === b.length && left.every((value, index) => value === b[index]);
}

// Reuse an existing subscription only if it was made with the current server key;
// otherwise the push service rejects every delivery (e.g. after moving to Vercel).
export async function subscribeWithKey(registration: ServiceWorkerRegistration, publicKey: string) {
  const applicationServerKey = decodeVapidKey(publicKey);
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    if (sameKey(existing.options?.applicationServerKey, applicationServerKey)) return existing;
    await existing.unsubscribe().catch(() => undefined);
  }
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey as BufferSource });
}
