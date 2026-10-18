# Smart Student

Smart Student is a student portal for course materials, announcements, schedules, subscriptions, and Telegram notifications.

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
