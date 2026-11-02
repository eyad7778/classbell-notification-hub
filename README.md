# Smart Student

Smart Student is a student portal for course materials, announcements, schedules, subscriptions, and Telegram notifications.

## PWA, subscriptions, and notifications

The public home page offers native Android PWA installation and iPhone Safari
instructions. The manifest uses the Smart Study app name; the service worker
caches versioned static assets and does not cache authenticated pages or API
responses.

Subscription plans are stored in `subscription_plans` and managed from the
admin Plans page. Migration `0011_subscription_plans_and_notification_cleanup`
seeds the existing price as the initial annual plan, preserves subscription
history, and intentionally deletes existing notification and announcement
records. It does not delete student, subscription, payment, or attendance data.
Review and apply the migration through the existing database deployment
workflow; it has not been applied to the external database from this repository.

Telegram linking can be initiated at any time and is not required to approve an
account or subscription. The existing database access policy still requires a
Telegram link for paid study content.

## Development

Requirements: Node.js 22.12 or newer and npm.

```powershell
npm install
npm run dev
```

Configure the Supabase and Telegram environment variables in the local environment and in the deployment provider before running the application.

## Deployment environment

For moving the existing Lovable Cloud database and accounts to a user-owned backend for Vercel, follow [the Vercel deployment guide](docs/vercel.md). Cloud-managed server keys cannot be copied to an external host.

Set these variables in Vercel:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_API_KEY` (the bot token from BotFather)

For Drizzle migrations, also set `DATABASE_URL`. If a protected cron route is enabled, configure `CRON_SECRET` and optionally `CRON_SECRET_PREVIOUS` during rotation.
