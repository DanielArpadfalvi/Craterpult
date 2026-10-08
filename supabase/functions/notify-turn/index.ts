// Craterpult pushes (M9). Called by the `notify_turn` trigger (pg_net) whenever a match is joined,
// a turn is stored ("your turn") or a rematch is offered, and hourly by `remind_slow_movers`
// (pg_cron) 12 hours before a reply runs out. Who gets which text: `message.ts`.
// Secrets (supabase secrets set …):
//   NOTIFY_SECRET            shared with the trigger (vault secret `notify_secret`)
//   FCM_SERVICE_ACCOUNT      Firebase service account JSON (Android)
//   APNS_KEY, APNS_KEY_ID, APNS_TEAM_ID, APNS_TOPIC (bundle id), APNS_SANDBOX=1 for dev builds (iOS)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
// Deno runtime (Supabase Edge Functions); not part of the app's TypeScript build.

import { planNotify, type NotifyKind, type NotifyMatch } from './message.ts';

interface Payload {
  match_id: string;
  kind?: NotifyKind;
}

interface Match extends NotifyMatch {
  id: string;
}

const env = (k: string): string => Deno.env.get(k) ?? '';
const SUPABASE_URL = env('SUPABASE_URL');
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');

async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`rest ${path}: ${res.status}`);
  return (await res.json()) as T;
}

const b64url = (data: ArrayBuffer | Uint8Array | string): string => {
  const bytes =
    typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data as ArrayBuffer);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

function pemBody(pem: string): Uint8Array {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function signJwt(
  header: Record<string, string>,
  claims: Record<string, unknown>,
  pem: string,
  alg: 'RS256' | 'ES256',
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemBody(pem),
    alg === 'RS256'
      ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
      : { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const sig = await crypto.subtle.sign(
    alg === 'RS256' ? 'RSASSA-PKCS1-v1_5' : { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(input),
  );
  return `${input}.${b64url(sig)}`;
}

async function fcmAccessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const jwt = await signJwt(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
    sa.private_key,
    'RS256',
  );
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error('fcm auth failed');
  return body.access_token;
}

interface Note {
  title: string;
  body: string;
  matchId: string;
  kind: NotifyKind;
}

async function sendFcm(tokens: string[], note: Note): Promise<void> {
  const raw = env('FCM_SERVICE_ACCOUNT');
  if (!raw || tokens.length === 0) return;
  const sa = JSON.parse(raw) as { client_email: string; private_key: string; project_id: string };
  const access = await fcmAccessToken(sa);
  await Promise.all(
    tokens.map((token) =>
      fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: note.title, body: note.body },
            data: { matchId: note.matchId, kind: note.kind },
            android: { collapse_key: note.matchId },
          },
        }),
      }),
    ),
  );
}

async function sendApns(tokens: string[], note: Note): Promise<void> {
  const key = env('APNS_KEY');
  if (!key || tokens.length === 0) return;
  const jwt = await signJwt(
    { alg: 'ES256', kid: env('APNS_KEY_ID') },
    { iss: env('APNS_TEAM_ID'), iat: Math.floor(Date.now() / 1000) },
    key,
    'ES256',
  );
  const host = env('APNS_SANDBOX') === '1' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
  await Promise.all(
    tokens.map((token) =>
      fetch(`https://${host}/3/device/${token}`, {
        method: 'POST',
        headers: {
          authorization: `bearer ${jwt}`,
          'apns-topic': env('APNS_TOPIC'),
          'apns-push-type': 'alert',
          'apns-collapse-id': note.matchId,
        },
        body: JSON.stringify({
          aps: { alert: { title: note.title, body: note.body }, sound: 'default' },
          matchId: note.matchId,
          kind: note.kind,
        }),
      }),
    ),
  );
}

Deno.serve(async (req) => {
  if (req.headers.get('authorization') !== `Bearer ${env('NOTIFY_SECRET')}`)
    return new Response('forbidden', { status: 403 });
  const { match_id, kind = 'turn' } = (await req.json()) as Payload;
  const [m] = await rest<Match[]>(
    `matches?id=eq.${encodeURIComponent(match_id)}` +
      '&select=id,status,players,names,next_team,rematch,rematch_by',
  );
  const plan = m ? planNotify(kind, m) : null;
  if (!m || !plan) return new Response('skip');
  const tokens = await rest<{ token: string; platform: string; lang: string }[]>(
    `push_tokens?user_id=eq.${plan.to}&select=token,platform,lang`,
  );
  await Promise.all(
    tokens.map((t) => {
      const note: Note = { title: 'Craterpult', body: plan.text(t.lang), matchId: m.id, kind };
      return t.platform === 'ios' ? sendApns([t.token], note) : sendFcm([t.token], note);
    }),
  );
  return new Response('ok');
});
