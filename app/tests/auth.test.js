import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from '../src/server.js';
import { buildAuthenticatedReviewActionInput } from '../src/auth/index.js';
import { loadAuthConfig, roleForUser } from '../src/auth/config.js';

const SECRET = '0123456789abcdefghijklmnopqrstuvwxyz0123456789';

test('Entra auth config supports tenant-specific allow lists and roles', () => {
  const config = loadAuthConfig({
    ENTRA_AUTH_ENABLED: 'true',
    ENTRA_AUTH_SESSION_SECRET: SECRET,
    ENTRA_AUTH_DEPLOYMENTS_JSON: JSON.stringify([
      {
        deployment: 'stotz',
        tenantId: 'tenant-stotz',
        clientId: 'client-stotz',
        clientSecret: 'secret',
        publicOrigin: 'https://stotz.example.test',
        allowedUsers: ['reviewer@stotzeq.com'],
        managerUsers: ['manager@stotzeq.com']
      },
      {
        deployment: 'premier',
        tenantId: 'tenant-premier',
        clientId: 'client-premier',
        clientSecret: 'secret',
        publicOrigin: 'https://premier.example.test',
        allowedUsers: ['reviewer@premierequipment.ca']
      }
    ])
  });

  assert.equal(config.enabled, true);
  assert.equal(config.deployments.length, 2);
  assert.deepEqual(roleForUser({ email: 'manager@stotzeq.com' }, config.deployments[0]), ['reviewer', 'manager']);
  assert.deepEqual(roleForUser({ email: 'reviewer@premierequipment.ca' }, config.deployments[1]), ['reviewer']);
  assert.deepEqual(roleForUser({ email: 'manager@stotzeq.com' }, config.deployments[1]), []);
});

test('authenticated review action input overwrites spoofable reviewer identity', () => {
  const input = buildAuthenticatedReviewActionInput(
    { reviewer: 'browser-spoof', actionType: 'approve_packet', payload: { source: 'ui' } },
    {
      deployment: { deployment: 'stotz' },
      user: {
        objectId: 'entra-object-id',
        displayName: 'Jane Reviewer',
        email: 'jane@stotzeq.com',
        upn: 'jane@stotzeq.com',
        tenantId: 'tenant-stotz',
        roles: ['reviewer', 'manager'],
        deployment: 'stotz'
      }
    }
  );

  assert.equal(input.reviewer, 'Jane Reviewer <jane@stotzeq.com>');
  assert.equal(input.reviewerIdentity.entraObjectId, 'entra-object-id');
  assert.equal(input.reviewerIdentity.role, 'manager');
  assert.equal(input.payload.source, 'ui');
  assert.equal(input.payload.authenticatedReviewer.email, 'jane@stotzeq.com');
});

test('review endpoints require Entra auth before touching queue storage', async () => {
  await withEnv({
    ENTRA_AUTH_ENABLED: 'true',
    ENTRA_AUTH_SESSION_SECRET: SECRET,
    ENTRA_AUTH_TENANT_ID: 'tenant-id',
    ENTRA_AUTH_CLIENT_ID: 'client-id',
    ENTRA_AUTH_CLIENT_SECRET: 'client-secret',
    ENTRA_AUTH_ALLOWED_USERS: 'reviewer@example.test',
    ENTRA_AUTH_PUBLIC_ORIGIN: 'https://review.example.test'
  }, async () => {
    const { server, baseUrl } = await startTestServer();
    try {
      const response = await fetch(`${baseUrl}/review/cases?limit=1`);
      const body = await response.json();
      assert.equal(response.status, 401);
      assert.equal(body.authenticated, false);
      assert.match(body.loginUrl, /^\/auth\/login\?/);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});

test('auth login starts an Entra authorization-code flow with the deployment callback', async () => {
  await withEnv({
    ENTRA_AUTH_ENABLED: 'true',
    ENTRA_AUTH_SESSION_SECRET: SECRET,
    ENTRA_AUTH_TENANT_ID: 'tenant-id',
    ENTRA_AUTH_CLIENT_ID: 'client-id',
    ENTRA_AUTH_CLIENT_SECRET: 'client-secret',
    ENTRA_AUTH_ALLOWED_USERS: 'reviewer@example.test',
    ENTRA_AUTH_PUBLIC_ORIGIN: 'https://review.example.test'
  }, async () => {
    const { server, baseUrl } = await startTestServer();
    try {
      const response = await fetch(`${baseUrl}/auth/login?returnTo=/trade-review/`, { redirect: 'manual' });
      assert.equal(response.status, 302);
      const location = new URL(response.headers.get('location'));
      assert.equal(location.hostname, 'login.microsoftonline.com');
      assert.equal(location.searchParams.get('client_id'), 'client-id');
      assert.equal(location.searchParams.get('redirect_uri'), 'https://review.example.test/auth/callback');
      assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
      assert.match(response.headers.get('set-cookie') || '', /tia_auth_state=/);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});

async function startTestServer() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  return {
    server,
    baseUrl: `http://${address.address}:${address.port}`
  };
}

async function withEnv(values, fn) {
  const previous = {};
  for (const key of Object.keys(values)) {
    previous[key] = process.env[key];
    process.env[key] = values[key];
  }
  try {
    await fn();
  } finally {
    for (const key of Object.keys(values)) {
      if (previous[key] == null) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}
