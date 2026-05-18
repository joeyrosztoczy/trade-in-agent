const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

export function loadAuthConfig(env = process.env) {
  const enabled = parseBoolean(env.ENTRA_AUTH_ENABLED, false);
  const deployments = loadDeployments(env);
  return {
    enabled,
    sessionSecret: env.ENTRA_AUTH_SESSION_SECRET || env.SESSION_SECRET || '',
    sessionTtlSeconds: clampNumber(env.ENTRA_AUTH_SESSION_TTL_SECONDS, 3600 * 8, 300, 3600 * 24),
    stateTtlSeconds: clampNumber(env.ENTRA_AUTH_STATE_TTL_SECONDS, 600, 60, 1800),
    defaultDeployment: env.ENTRA_AUTH_DEPLOYMENT || '',
    defaultReturnTo: env.ENTRA_AUTH_DEFAULT_RETURN_TO || '/trade-review/',
    deployments
  };
}

export function parseBoolean(value, fallback = false) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return fallback;
}

export function parseCsv(value) {
  if (Array.isArray(value)) return value.map(String).map(item => item.trim()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function resolveDeployment(config, req, url) {
  const deployments = config.deployments || [];
  if (!deployments.length) return null;

  const requested = url.searchParams.get('deployment') || config.defaultDeployment;
  if (requested) {
    const byName = deployments.find(deployment => deployment.deployment === requested);
    if (byName) return byName;
  }

  const host = requestHost(req);
  if (host) {
    const byHost = deployments.find(deployment => deployment.hosts.includes(host));
    if (byHost) return byHost;
  }

  return deployments.length === 1 ? deployments[0] : null;
}

export function requestHost(req) {
  const forwarded = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  return stripPort(forwarded || req.headers.host || '');
}

export function requestOrigin(req, deployment = null) {
  if (deployment?.publicOrigin) return deployment.publicOrigin.replace(/\/$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || (req.socket?.encrypted ? 'https' : 'http');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim();
  return `${proto}://${host}`.replace(/\/$/, '');
}

export function redirectUriForRequest(req, deployment) {
  return `${requestOrigin(req, deployment)}/auth/callback`;
}

export function logoutRedirectUriForRequest(req, deployment, returnTo = '/trade-review/') {
  return `${requestOrigin(req, deployment)}${sanitizeReturnTo(returnTo)}`;
}

export function sanitizeReturnTo(value, fallback = '/trade-review/') {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('//')) return fallback;
  try {
    const parsed = new URL(raw, 'http://local.invalid');
    if (parsed.origin !== 'http://local.invalid') return fallback;
    const path = `${parsed.pathname || '/'}${parsed.search || ''}${parsed.hash || ''}`;
    return path.startsWith('/') ? path : fallback;
  } catch {
    return raw.startsWith('/') ? raw : fallback;
  }
}

export function roleForUser(user, deployment) {
  const email = normalizeEmail(user.email || user.upn || user.preferredUsername);
  const objectId = String(user.objectId || '').toLowerCase();
  const groups = new Set((user.groups || []).map(group => String(group).toLowerCase()));

  const roles = new Set();
  if (deployment.allowedUsers.has(email) || deployment.allowedObjectIds.has(objectId)) roles.add('reviewer');
  for (const [role, members] of Object.entries(deployment.roleUsers)) {
    if (members.has(email) || members.has(objectId)) roles.add(role);
  }
  for (const [role, allowedGroups] of Object.entries(deployment.roleGroups)) {
    if (allowedGroups.some(group => groups.has(group))) roles.add(role);
  }
  if (roles.has('admin') || roles.has('manager')) roles.add('reviewer');

  return [...roles].sort(roleSort);
}

export function isAllowedUser(user, deployment) {
  return roleForUser(user, deployment).length > 0;
}

export function roleSort(a, b) {
  const order = { reviewer: 0, manager: 1, admin: 2 };
  return (order[a] ?? 99) - (order[b] ?? 99);
}

function loadDeployments(env) {
  const fromJson = loadDeploymentsJson(env);
  if (fromJson.length) return fromJson;

  const deployments = [];
  const flat = normalizeDeployment({
    deployment: env.ENTRA_AUTH_DEPLOYMENT || 'default',
    tenantLabel: env.ENTRA_AUTH_TENANT_LABEL || env.ENTRA_AUTH_DEPLOYMENT || 'Microsoft Entra',
    tenantId: env.ENTRA_AUTH_TENANT_ID,
    clientId: env.ENTRA_AUTH_CLIENT_ID,
    clientSecret: env.ENTRA_AUTH_CLIENT_SECRET,
    clientSecretEnv: env.ENTRA_AUTH_CLIENT_SECRET_ENV,
    publicOrigin: env.ENTRA_AUTH_PUBLIC_ORIGIN,
    hosts: parseCsv(env.ENTRA_AUTH_HOSTS),
    allowedUsers: parseCsv(env.ENTRA_AUTH_ALLOWED_USERS),
    allowedObjectIds: parseCsv(env.ENTRA_AUTH_ALLOWED_OBJECT_IDS),
    managerUsers: parseCsv(env.ENTRA_AUTH_MANAGER_USERS),
    adminUsers: parseCsv(env.ENTRA_AUTH_ADMIN_USERS),
    reviewerGroups: parseCsv(env.ENTRA_AUTH_REVIEWER_GROUPS),
    managerGroups: parseCsv(env.ENTRA_AUTH_MANAGER_GROUPS),
    adminGroups: parseCsv(env.ENTRA_AUTH_ADMIN_GROUPS)
  }, env);
  if (flat.tenantId || flat.clientId || flat.allowedUsers.size) deployments.push(flat);

  for (const prefix of ['STOTZ', 'PREMIER']) {
    const deployment = normalizeDeployment({
      deployment: prefix.toLowerCase(),
      tenantLabel: env[`${prefix}_ENTRA_TENANT_LABEL`] || (prefix === 'STOTZ' ? 'Stotz' : 'Premier'),
      tenantId: env[`${prefix}_ENTRA_TENANT_ID`],
      clientId: env[`${prefix}_ENTRA_CLIENT_ID`],
      clientSecret: env[`${prefix}_ENTRA_CLIENT_SECRET`],
      clientSecretEnv: env[`${prefix}_ENTRA_CLIENT_SECRET_ENV`],
      publicOrigin: env[`${prefix}_ENTRA_PUBLIC_ORIGIN`],
      hosts: parseCsv(env[`${prefix}_ENTRA_HOSTS`]),
      allowedUsers: parseCsv(env[`${prefix}_ENTRA_ALLOWED_USERS`]),
      allowedObjectIds: parseCsv(env[`${prefix}_ENTRA_ALLOWED_OBJECT_IDS`]),
      managerUsers: parseCsv(env[`${prefix}_ENTRA_MANAGER_USERS`]),
      adminUsers: parseCsv(env[`${prefix}_ENTRA_ADMIN_USERS`]),
      reviewerGroups: parseCsv(env[`${prefix}_ENTRA_REVIEWER_GROUPS`]),
      managerGroups: parseCsv(env[`${prefix}_ENTRA_MANAGER_GROUPS`]),
      adminGroups: parseCsv(env[`${prefix}_ENTRA_ADMIN_GROUPS`])
    }, env);
    if (deployment.tenantId || deployment.clientId || deployment.allowedUsers.size) deployments.push(deployment);
  }

  return deployments;
}

function loadDeploymentsJson(env) {
  const raw = env.ENTRA_AUTH_DEPLOYMENTS_JSON;
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`ENTRA_AUTH_DEPLOYMENTS_JSON must be valid JSON: ${error.message}`);
  }
  const entries = Array.isArray(parsed) ? parsed : Object.entries(parsed).map(([deployment, value]) => ({ deployment, ...value }));
  return entries.map(entry => normalizeDeployment(entry, env));
}

function normalizeDeployment(entry = {}, env) {
  const deployment = String(entry.deployment || entry.name || 'default').trim().toLowerCase();
  const publicOrigin = entry.publicOrigin ? String(entry.publicOrigin).replace(/\/$/, '') : '';
  const publicHost = publicOrigin ? safeUrlHost(publicOrigin) : '';
  const hosts = new Set([
    ...parseCsv(entry.hosts),
    publicHost
  ].filter(Boolean).map(stripPort));

  const clientSecret = entry.clientSecret || (entry.clientSecretEnv ? env[entry.clientSecretEnv] : '');
  const allowedUsers = parseCsv(entry.allowedUsers || entry.allowUsers || entry.allowlist || entry.allowedEmails).map(normalizeEmail);
  const reviewerUsers = parseCsv(entry.reviewerUsers).map(normalizeEmail);
  const managerUsers = parseCsv(entry.managerUsers).map(normalizeEmail);
  const adminUsers = parseCsv(entry.adminUsers).map(normalizeEmail);

  return {
    deployment,
    tenantLabel: String(entry.tenantLabel || entry.tenant || deployment).trim(),
    tenantId: String(entry.tenantId || '').trim(),
    clientId: String(entry.clientId || '').trim(),
    clientSecret: String(clientSecret || '').trim(),
    clientSecretEnv: String(entry.clientSecretEnv || '').trim(),
    publicOrigin,
    hosts: [...hosts],
    allowedUsers: new Set([...allowedUsers, ...reviewerUsers]),
    allowedObjectIds: new Set(parseCsv(entry.allowedObjectIds).map(value => String(value).toLowerCase())),
    roleUsers: {
      reviewer: new Set(reviewerUsers),
      manager: new Set(managerUsers),
      admin: new Set(adminUsers)
    },
    roleGroups: {
      reviewer: parseCsv(entry.reviewerGroups || entry.roleGroups?.reviewer).map(value => String(value).toLowerCase()),
      manager: parseCsv(entry.managerGroups || entry.roleGroups?.manager).map(value => String(value).toLowerCase()),
      admin: parseCsv(entry.adminGroups || entry.roleGroups?.admin).map(value => String(value).toLowerCase())
    }
  };
}

function stripPort(host) {
  return String(host || '').trim().toLowerCase().replace(/:\d+$/, '');
}

function safeUrlHost(value) {
  try {
    return new URL(value).host;
  } catch {
    return '';
  }
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}
