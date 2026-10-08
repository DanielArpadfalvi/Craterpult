/**
 * One-time helper: get a Google Drive refresh token for the CI APK upload
 * (`scripts/drive-upload.sh`). Run locally, sign in with the Drive owner's account in the browser,
 * then store the printed values as GitHub secrets.
 *
 *   GDRIVE_CLIENT_ID=... GDRIVE_CLIENT_SECRET=... npx tsx scripts/drive-auth.ts
 *
 * The client must be an OAuth client of type "Desktop app" (Google Cloud console) with the
 * Drive API enabled.
 */
import { createServer } from 'node:http';

const clientId = process.env.GDRIVE_CLIENT_ID;
const clientSecret = process.env.GDRIVE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('Set GDRIVE_CLIENT_ID and GDRIVE_CLIENT_SECRET first.');
  process.exit(1);
}
const PORT = 53682;
const redirect = `http://127.0.0.1:${PORT}`;
const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
auth.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirect,
  response_type: 'code',
  scope: 'https://www.googleapis.com/auth/drive',
  access_type: 'offline',
  prompt: 'consent',
}).toString();

const server = createServer((req, res) => {
  void (async () => {
    const code = new URL(req.url ?? '/', redirect).searchParams.get('code');
    if (!code) {
      res.end('No code.');
      return;
    }
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirect,
        grant_type: 'authorization_code',
      }),
    });
    const body = (await r.json()) as { refresh_token?: string; error?: string };
    res.end(body.refresh_token ? 'Done - back to the terminal.' : `Failed: ${body.error ?? r.status}`);
    if (body.refresh_token) {
      console.log('\nGitHub secret GDRIVE_REFRESH_TOKEN =\n' + body.refresh_token + '\n');
    } else {
      console.error('No refresh token:', body);
    }
    server.close();
  })();
});
server.listen(PORT, '127.0.0.1', () => {
  console.log('Open this URL and sign in with the Drive owner account:\n\n' + auth.toString());
});
