import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { closePool, getPool } from '../src/db.js';
import { migrate } from '../src/migrate.js';

const TEST_SIGNING_KEY = 'integration-test-secret';

let server;
let baseUrl;
let token;

before(async () => {
  assert.ok(process.env.DATABASE_URL, 'DATABASE_URL must be set for integration tests');

  process.env.JWT_SECRET = TEST_SIGNING_KEY;

  await getPool().query('DROP TABLE IF EXISTS orders, schema_migrations');
  await migrate();

  server = createApp().listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  token = jwt.sign({ sub: 'demo' }, TEST_SIGNING_KEY, { expiresIn: '5m' });
});

after(async () => {
  server.close();
  await closePool();
});

function authorized(path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
}

describe('migrations', () => {
  it('records every applied migration file', async () => {
    const { rows } = await getPool().query(
      'SELECT version FROM schema_migrations ORDER BY version',
    );

    assert.deepEqual(
      rows.map((row) => row.version),
      ['001_init.sql', '002_add_status.sql'],
    );
  });

  it('is idempotent on a second run', async () => {
    const applied = await migrate();
    assert.deepEqual(applied, []);
  });

  it('applies the second migration to the existing table', async () => {
    const { rows } = await getPool().query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'orders' ORDER BY column_name
    `);

    const columns = rows.map((row) => row.column_name);
    assert.deepEqual(columns, ['created_at', 'id', 'item', 'quantity', 'status']);
  });
});

describe('orders persistence', () => {
  it('stores an order and reads it back', async () => {
    const created = await authorized('/orders', {
      method: 'POST',
      body: JSON.stringify({ item: 'integration-widget', quantity: 3 }),
    });

    assert.equal(created.status, 201);

    const order = await created.json();
    assert.equal(order.item, 'integration-widget');
    assert.equal(order.quantity, 3);
    assert.equal(order.status, 'new');
    assert.ok(Number.isInteger(order.id));

    const listed = await authorized('/orders');
    const { orders } = await listed.json();

    assert.ok(orders.some((row) => row.id === order.id));
  });

  it('defaults quantity to 1 when it is not a positive integer', async () => {
    const response = await authorized('/orders', {
      method: 'POST',
      body: JSON.stringify({ item: 'default-quantity', quantity: -5 }),
    });

    const order = await response.json();
    assert.equal(order.quantity, 1);
  });

  it('reports readiness once the database answers', async () => {
    const response = await fetch(`${baseUrl}/ready`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ready' });
  });
});
