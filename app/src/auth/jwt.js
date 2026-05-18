import { createPublicKey, verify as verifySignature } from 'node:crypto';
import { base64urlDecode } from './session.js';

const metadataCache = new Map();
const jwksCache = new Map();
const CLOCK_SKEW_SECONDS = 120;

export function decodeJwt(token) {
  const [encodedHeader, encodedPayload, signature] = String(token || '').split('.');
  if (!encodedHeader || !encodedPayload || !signature) throw new Error('JWT is malformed');
  return {
    encodedHeader,
    encodedPayload,
    signature,
    header: JSON.parse(base64urlDecode(encodedHeader).toString('utf8')),
    payload: JSON.parse(base64urlDecode(encodedPayload).toString('utf8'))
  };
}

export async function validateEntraIdToken(idToken, deployment, { nonce } = {}) {
  const decoded = decodeJwt(idToken);
  if (decoded.header.alg !== 'RS256') throw new Error('Unsupported ID token algorithm');
  if (!decoded.header.kid) throw new Error('ID token is missing a key id');

  const metadata = await getOpenIdMetadata(deployment.tenantId);
  const jwks = await getJwks(metadata.jwks_uri);
  const jwk = (jwks.keys || []).find(candidate => candidate.kid === decoded.header.kid);
  if (!jwk) throw new Error('No matching signing key for ID token');

  const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
  const verified = verifySignature(
    'RSA-SHA256',
    Buffer.from(`${decoded.encodedHeader}.${decoded.encodedPayload}`),
    publicKey,
    base64urlDecode(decoded.signature)
  );
  if (!verified) throw new Error('ID token signature is invalid');

  validateClaims(decoded.payload, deployment, metadata, nonce);
  return decoded.payload;
}

export async function getOpenIdMetadata(tenantId) {
  if (!tenantId) throw new Error('Entra tenant id is required');
  const cached = metadataCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/v2.0/.well-known/openid-configuration`);
  if (!response.ok) throw new Error(`Failed to load Entra OpenID configuration (${response.status})`);
  const value = await response.json();
  metadataCache.set(tenantId, { value, expiresAt: Date.now() + 3600_000 });
  return value;
}

async function getJwks(jwksUri) {
  const cached = jwksCache.get(jwksUri);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const response = await fetch(jwksUri);
  if (!response.ok) throw new Error(`Failed to load Entra signing keys (${response.status})`);
  const value = await response.json();
  jwksCache.set(jwksUri, { value, expiresAt: Date.now() + 3600_000 });
  return value;
}

function validateClaims(claims, deployment, metadata, expectedNonce) {
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp == null || Number(claims.exp) < now - CLOCK_SKEW_SECONDS) throw new Error('ID token is expired');
  if (claims.nbf != null && Number(claims.nbf) > now + CLOCK_SKEW_SECONDS) throw new Error('ID token is not valid yet');
  if (claims.aud !== deployment.clientId && !(Array.isArray(claims.aud) && claims.aud.includes(deployment.clientId))) {
    throw new Error('ID token audience does not match the configured client id');
  }
  if (claims.tid !== deployment.tenantId) throw new Error('ID token tenant does not match this deployment');
  if (metadata.issuer && claims.iss !== metadata.issuer) throw new Error('ID token issuer does not match this tenant');
  if (expectedNonce && claims.nonce !== expectedNonce) throw new Error('ID token nonce does not match the login request');
}
