import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';

const JWT_SECRET = 'unit-test-secret';
const DEMO_USER = 'demo';
const DEMO_PASSWORD = 'unit-test-password';

let server;
let baseUrl;

before(() => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.DEMO_USER = DEMO_USER;
  process.env.DEMO_PASSWORD = DEMO_PASSWORD;

  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
});

function login(body) {
  return fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /login', () => {
  it('returns a token signed with the configured secret', async () => {
    const response = await login({ username: DEMO_USER, password: DEMO_PASSWORD });
    assert.equal(response.status, 200);

    const { token } = await response.json();
    const payload = jwt.verify(token, JWT_SECRET);
    assert.equal(payload.sub, DEMO_USER);
  });

  it('rejects a wrong password', async () => {
    const response = await login({ username: DEMO_USER, password: 'wrong' });
    assert.equal(response.status, 401);
  });

  it('rejects an unknown user', async () => {
    const response = await login({ username: 'intruder', password: DEMO_PASSWORD });
    assert.equal(response.status, 401);
  });

  it('rejects an empty body', async () => {
    const response = await fetch(`${baseUrl}/login`, { method: 'POST' });
    assert.equal(response.status, 401);
  });

  it('issues a token that fails verification against another secret', async () => {
    const response = await login({ username: DEMO_USER, password: DEMO_PASSWORD });
    const { token } = await response.json();

    assert.throws(() => jwt.verify(token, 'some-other-secret'));
  });
});

describe('probe endpoints', () => {
  it('answers liveness on /health', async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  });

  it('answers readiness on /ready', async () => {
    const response = await fetch(`${baseUrl}/ready`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ready' });
  });
});

describe('GET /metrics', () => {
  it('exposes prometheus metrics including request counters', async () => {
    await fetch(`${baseUrl}/health`);

    const response = await fetch(`${baseUrl}/metrics`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /http_requests_total/);
    assert.match(body, /http_request_duration_seconds/);
    assert.match(body, /process_cpu_seconds_total/);
  });
});

describe('startup validation', () => {
  it('refuses to start without required secrets', () => {
    const savedSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    assert.throws(() => createApp(), /JWT_SECRET/);

    process.env.JWT_SECRET = savedSecret;
  });
});
