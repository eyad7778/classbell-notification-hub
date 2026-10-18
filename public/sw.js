self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text() ?? "" };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Smart Student", {
      body: data.body || "لديك إشعار جديد",
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: data.tag || undefined,
      data: { url: data.url || "/app/notifications" },
      dir: "auto",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/app/notifications", self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => new URL(client.url).origin === target.origin);
      if (existing) {
        existing.navigate(target.href);
        return existing.focus();
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
