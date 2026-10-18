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