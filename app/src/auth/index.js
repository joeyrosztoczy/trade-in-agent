import {
  isAllowedUser,
  loadAuthConfig,
  logoutRedirectUriForRequest,
  redirectUriForRequest,
  resolveDeployment,
  roleForUser,
  roleSort,
  sanitizeReturnTo
} from './config.js';
import {
  clearCookie,
  cookieNames,
  isSecureRequest,
  parseCookies,
  randomToken,
  sealCookie,
  serializeCookie,
  sha256Base64url,
  unsealCookie
} from './session.js';
import { validateEntraIdToken } from './jwt.js';

const LOGIN_SCOPES = 'openid profile email';
const MANAGER_ACTIONS = new Set(['approve_packet']);
const MUTATING_METHODS = new Set(['POST', 'PATCH', 'DELETE']);

export function isAuthRoute(pathname) {
  return pathname === '/auth/login' ||
    pathname === '/auth/callback' ||
    pathname === '/auth/logout' ||
    pathname === '/auth/me' ||
    pathname === '/auth/verify';
}

export async function handleAuthRoute(req, res, url) {
  const config = loadAuthConfig();
  if (url.pathname === '/auth/login') return handleLogin(req, res, url, config);
  if (url.pathname === '/auth/callback') return handleCallback(req, res, url, config);
  if (url.pathname === '/auth/logout') return handleLogout(req, res, url, config);
  if (url.pathname === '/auth/me') return handleMe(req, res, url, config);
  if (url.pathname === '/auth/verify') return handleVerify(req, res, url, config);
  return false;
}

export async function requireReviewAuth(req, url, { actionType = null, requireCsrf = false } = {}) {
  const config = loadAuthConfig();
  if (!config.enabled) {
    return { ok: true, user: localDevUser(), csrfToken: null, config, deployment: null };
  }

  const session = readSession(req, config);
  if (!session) {
    return { ok: false, status: 401, body: authError('Authentication required', req, url, config) };
  }

  const deployment = resolveDeployment(config, req, url) ||
    config.deployments.find(candidate => candidate.deployment === session.deployment);
  if (!deployment || session.deployment !== deployment.deployment) {
    return { ok: false, status: 401, body: authError('Authentication is not valid for this deployment', req, url, config) };
  }

  const roles = roleForUser(session.user, deployment);
  if (!roles.length) {
    return { ok: false, status: 403, body: { error: 'User is not allowed for this review deployment' } };
  }

  if (actionType && MANAGER_ACTIONS.has(actionType) && !hasAnyRole(roles, ['manager', 'admin'])) {
    return { ok: false, status: 403, body: { error: 'Manager role is required for this reviewer action' } };
  }

  if (requireCsrf && MUTATING_METHODS.has(req.method || '')) {
    const header = String(req.headers['x-csrf-token'] || '');
    if (!header || header !== session.csrfToken) {
      return { ok: false, status: 403, body: { error: 'CSRF token is missing or invalid' } };
    }
  }

  return {
    ok: true,
    user: { ...session.user, roles },
    csrfToken: session.csrfToken,
    config,
    deployment
  };
}

export function buildAuthenticatedReviewActionInput(input = {}, authContext) {
  const user = authContext?.user || localDevUser();
  const roles = [...(user.roles || ['reviewer'])].sort(roleSort);
  const primaryRole = roles.includes('admin') ? 'admin' : roles.includes('manager') ? 'manager' : roles[0] || 'reviewer';
  const display = user.displayName || user.name || user.email || user.upn || 'reviewer';
  const email = user.email || user.upn || null;
  const reviewer = email ? `${display} <${email}>` : display;
  const authenticatedReviewer = {
    entraObjectId: user.objectId || null,
    displayName: display,
    email,
    upn: user.upn || email,
    role: primaryRole,
    roles,
    tenantId: user.tenantId || null,
    deployment: user.deployment || authContext?.deployment?.deployment || null
  };

  return {
    ...input,
    reviewer,
    reviewedBy: reviewer,
    reviewerIdentity: authenticatedReviewer,
    payload: {
      ...(input.payload || input.metadata || {}),
      authenticatedReviewer
    }
  };
}

function handleLogin(req, res, url, config) {
  if (!config.enabled) return redirect(res, sanitizeReturnTo(url.searchParams.get('returnTo'), config.defaultReturnTo));
  const deployment = resolveDeployment(config, req, url);
  const validationError = validateDeploymentConfig(config, deployment);
  if (validationError) return sendJson(res, 500, { error: validationError });

  const state = randomToken(24);
  const nonce = randomToken(24);
  const codeVerifier = randomToken(64);
  const returnTo = sanitizeReturnTo(
    url.searchParams.get('returnTo') || req.headers['x-forwarded-uri'] || config.defaultReturnTo,
    config.defaultReturnTo
  );
  const statePayload = {
    state,
    nonce,
    codeVerifier,
    returnTo,
    deployment: deployment.deployment,
    exp: Math.floor(Date.now() / 1000) + config.stateTtlSeconds
  };
  const names = cookieNames();
  const stateCookie = serializeCookie(names.state, sealCookie(statePayload, config.sessionSecret), {
    maxAge: config.stateTtlSeconds,
    secure: isSecureRequest(req)
  });

  const loginUrl = new URL(`https://login.microsoftonline.com/${deployment.tenantId}/oauth2/v2.0/authorize`);
  loginUrl.searchParams.set('client_id', deployment.clientId);
  loginUrl.searchParams.set('response_type', 'code');
  loginUrl.searchParams.set('redirect_uri', redirectUriForRequest(req, deployment));
  loginUrl.searchParams.set('response_mode', 'query');
  loginUrl.searchParams.set('scope', LOGIN_SCOPES);
  loginUrl.searchParams.set('state', state);
  loginUrl.searchParams.set('nonce', nonce);
  loginUrl.searchParams.set('code_challenge', sha256Base64url(codeVerifier));
  loginUrl.searchParams.set('code_challenge_method', 'S256');

  return redirect(res, loginUrl.toString(), { 'Set-Cookie': stateCookie });
}

async function handleCallback(req, res, url, config) {
  if (!config.enabled) return redirect(res, config.defaultReturnTo);
  const names = cookieNames();
  const cookies = parseCookies(req.headers.cookie || '');
  const statePayload = unsealCookie(cookies[names.state], config.sessionSecret);
  const clearState = clearCookie(names.state, req);
  if (!statePayload || statePayload.exp < Math.floor(Date.now() / 1000)) {
    return sendHtml(res, 400, 'Sign-in expired', 'The Microsoft sign-in request expired. Please start sign-in again.', { 'Set-Cookie': clearState });
  }
  if (url.searchParams.get('state') !== statePayload.state) {
    return sendHtml(res, 400, 'Sign-in could not be verified', 'The Microsoft sign-in response did not match this browser session.', { 'Set-Cookie': clearState });
  }
  if (url.searchParams.get('error')) {
    return sendHtml(res, 401, 'Microsoft sign-in failed', url.searchParams.get('error_description') || url.searchParams.get('error'), { 'Set-Cookie': clearState });
  }

  const deployment = config.deployments.find(candidate => candidate.deployment === statePayload.deployment);
  const validationError = validateDeploymentConfig(config, deployment);
  if (validationError) return sendHtml(res, 500, 'Authentication is not configured', validationError, { 'Set-Cookie': clearState });

  try {
    const tokenSet = await redeemAuthorizationCode(url.searchParams.get('code'), req, deployment, statePayload.codeVerifier);
    const claims = await validateEntraIdToken(tokenSet.id_token, deployment, { nonce: statePayload.nonce });
    const user = userFromClaims(claims, deployment);
    if (!isAllowedUser(user, deployment)) {
      return sendHtml(res, 403, 'Access denied', 'Your Microsoft account is not on the review allow list for this deployment.', { 'Set-Cookie': clearState });
    }

    const roles = roleForUser(user, deployment);
    const sessionPayload = {
      deployment: deployment.deployment,
      user: { ...user, roles },
      csrfToken: randomToken(32),
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + config.sessionTtlSeconds
    };
    const sessionCookie = serializeCookie(names.session, sealCookie(sessionPayload, config.sessionSecret), {
      maxAge: config.sessionTtlSeconds,
      secure: isSecureRequest(req)
    });
    return redirect(res, sanitizeReturnTo(statePayload.returnTo, config.defaultReturnTo), {
      'Set-Cookie': [clearState, sessionCookie]
    });
  } catch (error) {
    return sendHtml(res, 401, 'Microsoft sign-in failed', error.message || String(error), { 'Set-Cookie': clearState });
  }
}

function handleLogout(req, res, url, config) {
  const names = cookieNames();
  const session = readSession(req, config);
  const deployment = session
    ? config.deployments.find(candidate => candidate.deployment === session.deployment)
    : resolveDeployment(config, req, url);
  const returnTo = sanitizeReturnTo(url.searchParams.get('returnTo'), config.defaultReturnTo);
  const headers = { 'Set-Cookie': clearCookie(names.session, req) };

  if (config.enabled && deployment?.tenantId) {
    const logoutUrl = new URL(`https://login.microsoftonline.com/${deployment.tenantId}/oauth2/v2.0/logout`);
    logoutUrl.searchParams.set('post_logout_redirect_uri', logoutRedirectUriForRequest(req, deployment, returnTo));
    return redirect(res, logoutUrl.toString(), headers);
  }
  return redirect(res, returnTo, headers);
}

function handleMe(req, res, url, config) {
  if (!config.enabled) {
    return sendJson(res, 200, {
      authenticated: true,
      authRequired: false,
      user: localDevUser(),
      csrfToken: null
    });
  }

  const session = readSession(req, config);
  if (!session) {
    return sendJson(res, 401, authError('Authentication required', req, url, config));
  }

  const deployment = config.deployments.find(candidate => candidate.deployment === session.deployment);
  if (!deployment) return sendJson(res, 401, authError('Authentication is not valid for this deployment', req, url, config));
  const roles = roleForUser(session.user, deployment);
  if (!roles.length) return sendJson(res, 403, { authenticated: false, error: 'User is not allowed for this review deployment' });

  return sendJson(res, 200, {
    authenticated: true,
    authRequired: true,
    deployment: deployment.deployment,
    tenantLabel: deployment.tenantLabel,
    user: { ...session.user, roles },
    csrfToken: session.csrfToken,
    logoutUrl: '/auth/logout'
  });
}

function handleVerify(req, res, url, config) {
  if (!config.enabled) return sendStatus(res, 204);
  const session = readSession(req, config);
  if (!session) {
    const loginUrl = loginUrlForRequest(req, url, config);
    return redirect(res, loginUrl, {}, 302);
  }
  const deployment = config.deployments.find(candidate => candidate.deployment === session.deployment);
  if (!deployment || !roleForUser(session.user, deployment).length) {
    return sendHtml(res, 403, 'Access denied', 'Your Microsoft account is not on the review allow list for this deployment.');
  }
  return sendStatus(res, 204, {
    'X-Trade-Reviewer': session.user.email || session.user.upn || session.user.displayName || 'reviewer'
  });
}

async function redeemAuthorizationCode(code, req, deployment, codeVerifier) {
  if (!code) throw new Error('Missing authorization code');
  const body = new URLSearchParams({
    client_id: deployment.clientId,
    client_secret: deployment.clientSecret,
    code,
    redirect_uri: redirectUriForRequest(req, deployment),
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
    scope: LOGIN_SCOPES
  });
  const response = await fetch(`https://login.microsoftonline.com/${deployment.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || `Token endpoint returned ${response.status}`);
  }
  if (!payload.id_token) throw new Error('Token endpoint did not return an ID token');
  return payload;
}

function readSession(req, config) {
  if (!config.sessionSecret) return null;
  const names = cookieNames();
  const cookies = parseCookies(req.headers.cookie || '');
  const session = unsealCookie(cookies[names.session], config.sessionSecret);
  if (!session || !session.exp || session.exp < Math.floor(Date.now() / 1000)) return null;
  return session;
}

function validateDeploymentConfig(config, deployment) {
  if (!config.sessionSecret || config.sessionSecret.length < 32) return 'ENTRA_AUTH_SESSION_SECRET must be set to at least 32 characters.';
  if (!deployment) return 'No Entra deployment matches this request host. Set ENTRA_AUTH_DEPLOYMENT or ENTRA_AUTH_DEPLOYMENTS_JSON.';
  if (!deployment.tenantId) return `Missing tenantId for Entra deployment "${deployment.deployment}".`;
  if (!deployment.clientId) return `Missing clientId for Entra deployment "${deployment.deployment}".`;
  if (!deployment.clientSecret) return `Missing client secret for Entra deployment "${deployment.deployment}".`;
  if (!deployment.allowedUsers.size && !deployment.allowedObjectIds.size && !hasAnyRoleGroups(deployment)) {
    return `Deployment "${deployment.deployment}" has no reviewer allow list.`;
  }
  return null;
}

function userFromClaims(claims, deployment) {
  const email = claims.email || claims.preferred_username || claims.upn || '';
  return {
    objectId: claims.oid || claims.sub || '',
    tenantId: claims.tid || deployment.tenantId,
    displayName: claims.name || email || 'Microsoft user',
    email,
    upn: claims.preferred_username || claims.upn || email,
    preferredUsername: claims.preferred_username || email,
    groups: Array.isArray(claims.groups) ? claims.groups : [],
    deployment: deployment.deployment
  };
}

function authError(message, req, url, config) {
  return {
    authenticated: false,
    error: message,
    loginUrl: loginUrlForRequest(req, url, config)
  };
}

function loginUrlForRequest(req, url, config) {
  const returnTo = sanitizeReturnTo(url.pathname === '/auth/verify'
    ? req.headers['x-forwarded-uri'] || config.defaultReturnTo
    : `${url.pathname}${url.search || ''}`, config.defaultReturnTo);
  return `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
}

function localDevUser() {
  return {
    objectId: 'local-dev',
    tenantId: 'local-dev',
    displayName: 'Local Reviewer',
    email: 'local-reviewer@example.test',
    upn: 'local-reviewer@example.test',
    roles: ['reviewer', 'manager', 'admin'],
    deployment: 'local'
  };
}

function hasAnyRole(roles, expected) {
  return expected.some(role => roles.includes(role));
}

function hasAnyRoleGroups(deployment) {
  return Object.values(deployment.roleGroups || {}).some(groups => groups.length > 0);
}

function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...corsHeaders(),
    ...headers
  });
  res.end(payload);
  return true;
}

function sendHtml(res, status, title, message, headers = {}) {
  const payload = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p><a href="/auth/login">Sign in</a></p></body></html>`;
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    ...corsHeaders(),
    ...headers
  });
  res.end(payload);
  return true;
}

function sendStatus(res, status, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...corsHeaders(), ...headers });
  res.end();
  return true;
}

function redirect(res, location, headers = {}, status = 302) {
  res.writeHead(status, {
    Location: location,
    'Cache-Control': 'no-store',
    ...corsHeaders(),
    ...headers
  });
  res.end();
  return true;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': process.env.CORS_ALLOW_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-CSRF-Token'
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
