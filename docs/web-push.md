# Device notifications

Device notifications use the browser Push API and the site's service worker. They require HTTPS (localhost is allowed for development), a supported browser, and VAPID keys configured on the server.

## Setup

1. Apply `drizzle/migrations/0005_push_subscriptions.sql` to the Supabase database.
2. Run `node scripts/generate-vapid-keys.mjs` once. Add the printed `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and a real contact `VAPID_SUBJECT` (for example, `mailto:support@your-domain`) to the server environment. Keep the private key secret and use the same key pair in every deployment.
3. Redeploy the server. The public key is returned only to authenticated users by the push configuration server function.
4. Students open the app, allow browser notifications, and choose **Connect this device**. Each browser/device must be connected separately.

Push delivery is included with direct notifications, announcements, and staff generated student notifications. Telegram delivery continues to follow its existing option.
