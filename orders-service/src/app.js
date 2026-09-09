import express from 'express';
import { requireAuth } from './auth.js';
import { getPool } from './db.js';
import { metricsHandler, metricsMiddleware } from './metrics.js';

const ORDER_COLUMNS = 'id, item, quantity, status, created_at';

export function createApp() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be set');
  }

  const failMode = process.env.FAIL_MODE === '1';
  const app = express();

  app.use(express.json());
  app.use(metricsMiddleware);

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.get('/ready', async (_req, res) => {
    try {
      await getPool().query('SELECT 1');
      return res.json({ status: 'ready' });
    } catch {
      return res.status(503).json({ status: 'database unavailable' });
    }
  });

  app.get('/metrics', metricsHandler);

  app.get('/orders', requireAuth, async (_req, res) => {
    if (failMode) {
      return res.status(500).json({ error: 'FAIL_MODE is enabled' });
    }

    const { rows } = await getPool().query(
      `SELECT ${ORDER_COLUMNS} FROM orders ORDER BY id DESC LIMIT 50`,
    );
    return res.json({ orders: rows });
  });

  app.post('/orders', requireAuth, async (req, res) => {
    if (failMode) {
      return res.status(500).json({ error: 'FAIL_MODE is enabled' });
    }

    const { item, quantity } = req.body ?? {};

    if (typeof item !== 'string' || item.trim() === '') {
      return res.status(400).json({ error: 'item is required' });
    }

    const { rows } = await getPool().query(
      `INSERT INTO orders (item, quantity) VALUES ($1, $2) RETURNING ${ORDER_COLUMNS}`,
      [item.trim(), Number.isInteger(quantity) && quantity > 0 ? quantity : 1],
    );
    return res.status(201).json(rows[0]);
  });

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}
