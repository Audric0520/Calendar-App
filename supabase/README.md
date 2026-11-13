# OmniCal Edge Functions (`send-reminders`)

The `send-reminders` Supabase Edge Function runs once per minute, evaluates active events and tasks across users who have at least one saved push subscription, and dispatches Web Push reminders 10 minutes before start (with a 5-minute catch-up window).

## Prerequisites

- Supabase CLI installed and authenticated (`supabase login`)
- Existing database tables (`events`, `push_subscriptions`, `sent_reminders`)
- A VAPID key pair (`VAPID_PUBLIC_KEY` matching the client's `VITE_VAPID_PUBLIC_KEY`, plus `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` like `mailto:admin@example.com`)
- A strong random `CRON_SECRET`

## Deploy Steps

1. Link your Supabase project (from the repo root):

   ```bash
   supabase link --project-ref <your-project-ref>
   ```

2. Set the required Edge Function secrets (never commit real secret values):

   ```bash
   supabase secrets set \
     CRON_SECRET="<random-secret>" \
     VAPID_PUBLIC_KEY="<vapid-public-key>" \
     VAPID_PRIVATE_KEY="<vapid-private-key>" \
     VAPID_SUBJECT="mailto:you@example.com"
   ```

   (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by Supabase at runtime.)

3. Deploy the function (`supabase/config.toml` sets `verify_jwt = false` so the cron trigger authenticates with `x-cron-secret` instead of a user JWT):

   ```bash
   supabase functions deploy send-reminders
   ```

4. Schedule a 1-minute cron job (via Supabase Cron / `pg_cron` + `pg_net` or an external scheduler) to send an HTTP `POST` request every minute to:

   ```
   https://<your-project-ref>.supabase.co/functions/v1/send-reminders
   ```

   with header:

   ```
   x-cron-secret: <your-CRON_SECRET>
   ```

5. Manual smoke check:

   ```bash
   curl -i -X POST \
     "https://<your-project-ref>.supabase.co/functions/v1/send-reminders" \
     -H "x-cron-secret: <your-CRON_SECRET>"
   ```

   Expected response: HTTP `200` with JSON `{ "users": ..., "due": ..., "sent": ..., "removed": ... }`. Requests missing or failing `x-cron-secret` receive HTTP `401`.
