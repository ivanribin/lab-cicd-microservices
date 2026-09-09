import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';

const TEST_SIGNING_KEY = 'unit-test-secret';

let server;
let baseUrl;
let token;

before(() => {
  process.env.JWT_SECRET = TEST_SIGNING_KEY;

  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  token = jwt.sign({ sub: 'demo' }, TEST_SIGNING_KEY, { expiresIn: '5m' });
});

after(() => {
  server.close();
});

describe('authorization', () => {
  it('rejects a request without a token', async () => {
    const response = await fetch(`${baseUrl}/orders`);
    assert.equal(response.status, 401);
  });

  it('rejects a malformed authorization header', async () => {
    const response = await fetch(`${baseUrl}/orders`, {
      headers: { Authorization: token },
    });
    assert.equal(response.status, 401);
  });

  it('rejects a token signed with another secret', async () => {
    const foreignToken = jwt.sign({ sub: 'demo' }, 'another-secret');

    const response = await fetch(`${baseUrl}/orders`, {
      headers: { Authorization: `Bearer ${foreignToken}` },
    });
    assert.equal(response.status, 401);
  });

  it('rejects an expired token', async () => {
    const expiredToken = jwt.sign({ sub: 'demo' }, TEST_SIGNING_KEY, { expiresIn: '-1s' });

    const response = await fetch(`${baseUrl}/orders`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    assert.equal(response.status, 401);
  });
});

describe('POST /orders validation', () => {
  it('rejects a missing item before touching the database', async () => {
    const response = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ quantity: 2 }),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'item is required' });
  });

  it('rejects a blank item', async () => {
    const response = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ item: '   ' }),
    });

    assert.equal(response.status, 400);
  });
});

describe('probe endpoints', () => {
  it('answers liveness on /health without a database', async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  });
});

describe('GET /metrics', () => {
  it('exposes prometheus metrics', async () => {
    await fetch(`${baseUrl}/health`);

    const response = await fetch(`${baseUrl}/metrics`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /http_requests_total/);
    assert.match(body, /http_request_duration_seconds/);
  });
});

describe('startup validation', () => {
  it('refuses to start without JWT_SECRET', () => {
    const savedSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    assert.throws(() => createApp(), /JWT_SECRET/);

    process.env.JWT_SECRET = savedSecret;
  });
});
