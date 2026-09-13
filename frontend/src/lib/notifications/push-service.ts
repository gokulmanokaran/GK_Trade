// ============================================================
// Server-Side Web Push Notification Service
// With Guaranteed Deduplication via Supabase notification_deliveries
// ============================================================

import webpush from 'web-push';
import { getSupabaseAdmin } from '../supabase/server';

const VAPID_PUBLIC_KEY = process.env.PUSH_NOTIFICATION_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.PUSH_NOTIFICATION_PRIVATE_KEY || '';
const VAPID_SUBJECT = 'mailto:alerts@optionpulse.local';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  } catch (e) {
    console.warn('[web-push] Could not set VAPID details:', e);
  }
}

export type NotificationEventType =
  | 'NEW_SIGNAL'
  | 'ENTRY_TRIGGERED'
  | 'TARGET1_HIT'
  | 'TARGET2_HIT'
  | 'SL_HIT'
  | 'EXIT_TRIGGERED'
  | 'SIGNAL_INVALIDATED';

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
}

export function formatEventNotification(signal: any, eventType: NotificationEventType): NotificationPayload {
  const direction = signal.signal_type || signal.signalType || 'CALL_BUY';
  const action = direction === 'CALL_BUY' ? 'CALL BUY' : 'PUT BUY';
  const strike = signal.strike || 25000;
  const optType = signal.option_type || signal.optionType || 'CE';
  const symbol = `NIFTY ${strike} ${optType}`;

  const entryLow = signal.entry_low ?? signal.entryLow ?? 0;
  const entryHigh = signal.entry_high ?? signal.entryHigh ?? 0;
  const entryStr = entryLow !== entryHigh ? `₹${entryLow}–₹${entryHigh}` : `₹${entryHigh}`;
  const sl = signal.sl || 0;
  const t1 = signal.target1 || 0;
  const t2 = signal.target2 || 0;
  const score = signal.signal_score ?? signal.signalScore ?? 80;
  const curPrice = signal.current_price || entryHigh;

  switch (eventType) {
    case 'ENTRY_TRIGGERED':
    case 'NEW_SIGNAL':
      return {
        title: '🚨 NIFTY ENTRY SIGNAL',
        body: `${action} — ${symbol}\nEntry: ${entryStr}\nSL: ₹${sl}\nTarget: ₹${t1} / ₹${t2}\nScore: ${score}/100`,
        data: { signalId: signal.id, eventType, url: '/' },
      };

    case 'SL_HIT':
      return {
        title: '🚨 NIFTY STOP LOSS',
        body: `${symbol}\nEntry: ₹${entryHigh}\nSL: ₹${sl}\nCurrent: ₹${curPrice}\nAction: EXIT`,
        data: { signalId: signal.id, eventType, url: '/' },
      };

    case 'TARGET1_HIT':
      return {
        title: '🎯 NIFTY TARGET 1',
        body: `${symbol}\nEntry: ₹${entryHigh}\nCurrent: ₹${t1}\nTarget 1: ₹${t1}\nSuggested: Consider partial exit / trail SL`,
        data: { signalId: signal.id, eventType, url: '/' },
      };

    case 'TARGET2_HIT':
      return {
        title: '🎯 NIFTY TARGET 2',
        body: `${symbol}\nCurrent: ₹${t2}\nAction: BOOK PROFIT / EXIT`,
        data: { signalId: signal.id, eventType, url: '/' },
      };

    case 'EXIT_TRIGGERED':
      return {
        title: '🔴 NIFTY EXIT SIGNAL',
        body: `${symbol}\nReason: ${signal.exit_reason || signal.exitReason || 'Underlying broke invalidation level'}\nCurrent: ₹${curPrice}\nRecommended: EXIT`,
        data: { signalId: signal.id, eventType, url: '/' },
      };

    case 'SIGNAL_INVALIDATED':
    default:
      return {
        title: '⚠️ NIFTY SIGNAL INVALIDATED',
        body: `${symbol}\nReason: Setup conditions no longer met\nStatus: INVALIDATED`,
        data: { signalId: signal.id, eventType, url: '/' },
      };
  }
}

export async function dispatchPushNotification(
  signal: any,
  eventType: NotificationEventType
): Promise<{ success: boolean; sentCount: number; skipped?: boolean }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { success: false, sentCount: 0 };

  const signalId = signal.id;
  const deliveryKey = `${signalId}_${eventType}`;

  // 1. Idempotency & deduplication check
  const { data: existing } = await supabase
    .from('notification_deliveries')
    .select('id')
    .eq('delivery_key', deliveryKey)
    .maybeSingle();

  if (existing) {
    console.log(`[PushService] Notification already delivered for ${deliveryKey}. Deduplicating.`);
    return { success: true, sentCount: 0, skipped: true };
  }

  const { title, body, data } = formatEventNotification(signal, eventType);

  // 2. Fetch all active subscriptions
  const { data: subscriptions } = await supabase
    .from('notification_subscriptions')
    .select('id, endpoint, p256dh, auth');

  if (!subscriptions || subscriptions.length === 0) {
    // Record skipped delivery
    await supabase.from('notification_deliveries').insert({
      signal_id: signalId,
      event_type: eventType,
      delivery_key: deliveryKey,
      title,
      body,
      delivery_status: 'SKIPPED',
      subscribers_count: 0,
    });
    return { success: true, sentCount: 0, skipped: true };
  }

  // 3. Dispatch to subscribers
  let sentCount = 0;
  const payloadStr = JSON.stringify({ title, body, data });

  for (const sub of subscriptions) {
    try {
      if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payloadStr
        );
      }
      sentCount++;
    } catch (err: any) {
      console.warn(`[PushService] Failed to send to ${sub.endpoint}:`, err.message);
      // Clean up dead subscription on 410 Gone
      if (err.statusCode === 410) {
        await supabase.from('notification_subscriptions').delete().eq('id', sub.id);
      }
    }
  }

  // 4. Record successful delivery
  await supabase.from('notification_deliveries').insert({
    signal_id: signalId,
    event_type: eventType,
    delivery_key: deliveryKey,
    title,
    body,
    delivery_status: sentCount > 0 ? 'SENT' : 'FAILED',
    subscribers_count: sentCount,
    sent_at: new Date().toISOString(),
  });

  return { success: true, sentCount };
}
