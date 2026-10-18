import { afterEach, describe, expect, it, vi } from "vitest";
import { getActivePushRegistration } from "@/lib/push-client";

function setup(state: ServiceWorkerState) {
  const worker = Object.assign(new EventTarget(), { state });
  const registration = {
    active: state === "activated" ? worker : null,
    installing: state === "activated" ? null : worker,
    waiting: null,
  };
  const register = vi.fn().mockResolvedValue(registration);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register },
  });
  return { worker, registration, register };
}

afterEach(() => vi.useRealTimers());

describe("push worker activation", () => {
  it("waits for first-install activation before allowing subscription", async () => {
    const { worker, registration, register } = setup("installing");
    const subscribe = vi.fn();
    const result = getActivePushRegistration().then((value) => {
      subscribe();
      return value;
    });
    await Promise.resolve();
    expect(register).toHaveBeenCalledWith("/sw.js");
    expect(subscribe).not.toHaveBeenCalled();
    worker.state = "installed";
    worker.dispatchEvent(new Event("statechange"));
    await Promise.resolve();
    expect(subscribe).not.toHaveBeenCalled();
    worker.state = "activated";
    worker.dispatchEvent(new Event("statechange"));
    expect(await result).toBe(registration);
    expect(subscribe).toHaveBeenCalledOnce();
  });

  it("reuses an already activated registration", async () => {
    const { registration } = setup("activated");
    expect(await getActivePushRegistration()).toBe(registration);
  });

  it("reports failed activation instead of subscribing", async () => {
    const { worker } = setup("installing");
    const result = getActivePushRegistration();
    const rejected = expect(result).rejects.toThrow("could not activate");
    await Promise.resolve();
    worker.state = "redundant";
    worker.dispatchEvent(new Event("statechange"));
    await rejected;
  });

  it("stops waiting if activation stalls", async () => {
    vi.useFakeTimers();
    setup("installing");
    const result = getActivePushRegistration();
    const rejected = expect(result).rejects.toThrow("took too long");
    await vi.advanceTimersByTimeAsync(15000);
    await rejected;
  });
});