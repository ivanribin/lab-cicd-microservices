const AUTH_URL = process.env.AUTH_URL ?? 'http://localhost:3001';
const ORDERS_URL = process.env.ORDERS_URL ?? 'http://localhost:3002';
const WEB_URL = process.env.WEB_URL ?? 'http://localhost:8080';
const DEMO_USER = process.env.DEMO_USER ?? 'demo';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD;
const TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS ?? 10000);

const results = [];

async function step(name, fn) {
  const startedAt = Date.now();

  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - startedAt });
    console.log(`PASS  ${name} (${Date.now() - startedAt}ms)`);
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - startedAt, error: error.message });
    console.error(`FAIL  ${name}: ${error.message}`);
  }
}

function request(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

let token;
let createdOrderId;

await step('auth-service is live', async () => {
  const response = await request(`${AUTH_URL}/health`);
  assert(response.status === 200, `expected 200, got ${response.status}`);
});

await step('orders-service is ready', async () => {
  const response = await request(`${ORDERS_URL}/ready`);
  assert(response.status === 200, `expected 200, got ${response.status}`);
});

await step('login returns a token', async () => {
  const response = await request(`${AUTH_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: DEMO_USER, password: DEMO_PASSWORD }),
  });

  assert(response.status === 200, `expected 200, got ${response.status}`);

  ({ token } = await response.json());
  assert(typeof token === 'string' && token.length > 0, 'token is missing in the response');
});

await step('orders are rejected without a token', async () => {
  const response = await request(`${ORDERS_URL}/orders`);
  assert(response.status === 401, `expected 401, got ${response.status}`);
});

await step('an order can be created', async () => {
  assert(token, 'no token from the login step');

  const response = await request(`${ORDERS_URL}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ item: `e2e-${Date.now()}`, quantity: 2 }),
  });

  assert(response.status === 201, `expected 201, got ${response.status}`);

  const order = await response.json();
  assert(Number.isInteger(order.id), 'created order has no id');
  assert(order.quantity === 2, `expected quantity 2, got ${order.quantity}`);

  createdOrderId = order.id;
});

await step('the created order is listed', async () => {
  assert(createdOrderId, 'no order was created in the previous step');

  const response = await request(`${ORDERS_URL}/orders`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  assert(response.status === 200, `expected 200, got ${response.status}`);

  const { orders } = await response.json();
  assert(
    orders.some((order) => order.id === createdOrderId),
    `order ${createdOrderId} is missing from the list`,
  );
});

await step('metrics are exposed for scraping', async () => {
  const response = await request(`${ORDERS_URL}/metrics`);
  const body = await response.text();

  assert(response.status === 200, `expected 200, got ${response.status}`);
  assert(body.includes('http_requests_total'), 'http_requests_total is missing');
});

await step('web-client is served', async () => {
  const response = await request(`${WEB_URL}/health`);
  assert(response.status === 200, `expected 200, got ${response.status}`);
});

const failed = results.filter((result) => !result.ok);

console.log(`\ne2e: ${results.length - failed.length}/${results.length} steps passed`);

if (failed.length > 0) {
  console.error(`e2e FAILED: ${failed.map((result) => result.name).join(', ')}`);
  process.exit(1);
}

console.log('e2e PASSED');
