import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const DEFAULT_COOKIE_NAME = 'tia_review_session';
const DEFAULT_STATE_COOKIE_NAME = 'tia_auth_state';

export function base64urlEncode(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  return buffer
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '');
}

export function base64urlDecode(value) {
  const normalized = String(value).replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64');
}

export function randomToken(byteLength = 32) {
  return base64urlEncode(randomBytes(byteLength));
}

export function sha256Base64url(value) {
  return base64urlEncode(createHash('sha256').update(String(value)).digest());
}

export function parseCookies(header = '') {
  return String(header)
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const index = part.indexOf('=');
      if (index === -1) return cookies;
      const name = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      if (name) {
        try {
          cookies[name] = decodeURIComponent(value);
        } catch {
          cookies[name] = value;
        }
      }
      return cookies;
    }, {});
}

export function serializeCookie(name, value, {
  maxAge,
  httpOnly = true,
  secure = true,
  sameSite = 'Lax',
  path = '/'
} = {}) {
  const parts = [`${name}=${encodeURIComponent(value || '')}`];
  if (maxAge != null) parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  parts.push(`Path=${path}`);
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  if (sameSite) parts.push(`SameSite=${sameSite}`);
  return parts.join('; ');
}

export function sealCookie(payload, secret) {
  if (!secret) throw new Error('Session secret is required');
  const encoded = base64urlEncode(JSON.stringify(payload));
  const signature = sign(encoded, secret);
  return `${encoded}.${signature}`;
}

export function unsealCookie(value, secret) {
  if (!value || !secret) return null;
  const [encoded, signature] = String(value).split('.');
  if (!encoded || !signature) return null;
  const expected = sign(encoded, secret);
  if (!safeEqual(signature, expected)) return null;
  try {
    return JSON.parse(base64urlDecode(encoded).toString('utf8'));
  } catch {
    return null;
  }
}

export function sign(value, secret) {
  return base64urlEncode(createHmac('sha256', secret).update(String(value)).digest());
}

function safeEqual(a, b) {
  const aBuffer = Buffer.from(String(a));
  const bBuffer = Buffer.from(String(b));
  if (aBuffer.length !== bBuffer.length) return false;
  return timingSafeEqual(aBuffer, bBuffer);
}

export function cookieNames(env = process.env) {
  return {
    session: env.ENTRA_AUTH_SESSION_COOKIE || DEFAULT_COOKIE_NAME,
    state: env.ENTRA_AUTH_STATE_COOKIE || DEFAULT_STATE_COOKIE_NAME
  };
}

export function isSecureRequest(req, env = process.env) {
  if (env.ENTRA_AUTH_COOKIE_SECURE === 'false' || env.ENTRA_AUTH_COOKIE_SECURE === '0') return false;
  if (env.ENTRA_AUTH_COOKIE_SECURE === 'true' || env.ENTRA_AUTH_COOKIE_SECURE === '1') return true;
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return proto === 'https' || Boolean(req.socket?.encrypted);
}

export function clearCookie(name, req, env = process.env) {
  return serializeCookie(name, '', { maxAge: 0, secure: isSecureRequest(req, env) });
}
