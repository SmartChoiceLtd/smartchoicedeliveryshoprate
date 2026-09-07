import { getStore } from '@netlify/blobs';

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders }
  });
}

// PBKDF2 password hashing - real key-derivation hashing (not a fast plain
// hash like raw SHA-256), so brute-forcing a stolen hash is meaningfully
// harder. Uses Web Crypto, no external dependency needed.
async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const salt = saltHex
    ? new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)))
    : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  const hashHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
  const saltOutHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  return { hash: hashHex, salt: saltOutHex };
}

async function verifyPassword(password, storedHash, storedSalt) {
  const { hash } = await hashPassword(password, storedSalt);
  return hash === storedHash;
}

function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('');
}

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14; // 14 days

function sessionCookie(token) {
  return `scd_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

function clearCookie() {
  return `scd_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export default async (req) => {
  const usersStore = getStore('flower-users');
  const sessionsStore = getStore('flower-sessions');
  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  if (req.method === 'POST' && action === 'login') {
    let body;
    try { body = await req.json(); } catch (e) { return json({ error: 'Invalid JSON body' }, 400); }
    const username = (body.username || '').trim().toLowerCase();
    const password = body.password || '';
    if (!username || !password) return json({ error: 'Username and password required' }, 400);

    const { blobs } = await usersStore.list();
    const users = (await Promise.all(blobs.map(b => usersStore.get(b.key, { type: 'json' })))).filter(Boolean);

    // First-run bootstrap: no accounts exist yet, so this login attempt
    // becomes account creation instead. Closes automatically once any
    // account exists - no open registration after that point.
    if (users.length === 0) {
      const { hash, salt } = await hashPassword(password);
      const newUser = { username, password_hash: hash, password_salt: salt, created_at: new Date().toISOString() };
      await usersStore.setJSON(username, newUser);
      const token = randomToken();
      await sessionsStore.setJSON(token, { username, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString() });
      return json({ success: true, username, bootstrapped: true }, 200, { 'set-cookie': sessionCookie(token) });
    }

    const user = users.find(u => u.username === username);
    if (!user) return json({ error: 'Invalid username or password' }, 401);
    const valid = await verifyPassword(password, user.password_hash, user.password_salt);
    if (!valid) return json({ error: 'Invalid username or password' }, 401);

    const token = randomToken();
    await sessionsStore.setJSON(token, { username, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString() });
    return json({ success: true, username }, 200, { 'set-cookie': sessionCookie(token) });
  }

  if (req.method === 'POST' && action === 'logout') {
    const cookieHeader = req.headers.get('cookie') || '';
    const match = cookieHeader.match(/scd_session=([a-f0-9]+)/);
    if (match) await sessionsStore.delete(match[1]).catch(() => {});
    return json({ success: true }, 200, { 'set-cookie': clearCookie() });
  }

  if (req.method === 'GET' && action === 'check') {
    const cookieHeader = req.headers.get('cookie') || '';
    const match = cookieHeader.match(/scd_session=([a-f0-9]+)/);
    if (!match) return json({ authenticated: false });
    const session = await sessionsStore.get(match[1], { type: 'json' });
    if (!session || new Date(session.expires_at) < new Date()) return json({ authenticated: false });
    return json({ authenticated: true, username: session.username });
  }

  if (req.method === 'GET' && action === 'needs-setup') {
    const { blobs } = await usersStore.list();
    return json({ needs_setup: blobs.length === 0 });
  }

  return json({ error: 'Unknown action' }, 400);
};

export const config = { path: '/api/auth' };
