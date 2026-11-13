import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import webpush from 'npm:web-push@3.6.7';
import {
  collectPagedRows,
  constantTimeEqual,
  runSendReminders,
  SUPABASE_PAGE_SIZE,
  type EventDbRow,
  type PushSubscriptionDbRow,
  type ReminderStore,
} from './logic.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
  const providedSecret = req.headers.get('x-cron-secret') ?? '';

  if (!constantTimeEqual(providedSecret, cronSecret)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? '';

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !vapidPublicKey ||
    !vapidPrivateKey ||
    !vapidSubject
  ) {
    console.error('Missing required server environment configuration.');
    return jsonResponse({ error: 'Server misconfigured' }, 500);
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const store: ReminderStore = {
    async deleteOldSentReminders(cutoffIso: string) {
      const { error } = await supabase
        .from('sent_reminders')
        .delete()
        .lt('sent_at', cutoffIso);
      if (error) {
        throw new Error(error.message);
      }
    },

    async fetchAllPushSubscriptions() {
      return await collectPagedRows<PushSubscriptionDbRow>(async (from, to) => {
        const { data, error } = await supabase
          .from('push_subscriptions')
          .select('user_id, endpoint, p256dh, auth, timezone, updated_at, created_at')
          .order('user_id', { ascending: true })
          .order('endpoint', { ascending: true })
          .range(from, to);

        if (error) {
          throw new Error(error.message);
        }
        return (data ?? []) as PushSubscriptionDbRow[];
      }, SUPABASE_PAGE_SIZE);
    },

    async fetchActiveEventsForUser(userId: string) {
      return await collectPagedRows<EventDbRow>(async (from, to) => {
        const { data, error } = await supabase
          .from('events')
          .select(
            'id, user_id, title, start_local, end_local, all_day, location, recurrence, recurrence_until, custom_recurrence, exception_dates, is_task, completed, deleted_at'
          )
          .eq('user_id', userId)
          .is('deleted_at', null)
          .order('id', { ascending: true })
          .range(from, to);

        if (error) {
          throw new Error(error.message);
        }
        return (data ?? []) as EventDbRow[];
      }, SUPABASE_PAGE_SIZE);
    },

    async tryInsertSentReminder({
      userId,
      eventId,
      occurrenceStart,
      sentAtIso,
    }) {
      const { data, error } = await supabase
        .from('sent_reminders')
        .upsert(
          {
            user_id: userId,
            event_id: eventId,
            occurrence_start: occurrenceStart,
            sent_at: sentAtIso,
          },
          {
            onConflict: 'user_id,event_id,occurrence_start',
            ignoreDuplicates: true,
          }
        )
        .select('event_id');

      if (error) {
        throw new Error(error.message);
      }
      return Array.isArray(data) && data.length > 0;
    },

    async deletePushSubscription(userId: string, endpoint: string) {
      const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('endpoint', endpoint);
      if (error) {
        throw new Error(error.message);
      }
    },
  };

  try {
    const summary = await runSendReminders({
      store,
      sendPush: async (sub, payloadJson, options) => {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payloadJson,
          options
        );
      },
    });
    return jsonResponse(summary, 200);
  } catch {
    console.error('send-reminders execution failed.');
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
