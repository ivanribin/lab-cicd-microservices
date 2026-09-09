import express from 'express';
import jwt from 'jsonwebtoken';
import { metricsHandler, metricsMiddleware } from './metrics.js';

export function createApp() {
  const jwtSecret = process.env.JWT_SECRET;
  const demoUser = process.env.DEMO_USER ?? 'demo';
  const demoPassword = process.env.DEMO_PASSWORD;
  const tokenTtl = process.env.TOKEN_TTL ?? '15m';

  if (!jwtSecret || !demoPassword) {
    throw new Error('JWT_SECRET and DEMO_PASSWORD must be set');
  }

  const app = express();

  app.use(express.json());
  app.use(metricsMiddleware);

  app.post('/login', (req, res) => {
    const { username, password } = req.body ?? {};

    if (username !== demoUser || password !== demoPassword) {
      return res.status(401).json({ error: 'invalid credentials' });
    }

    const token = jwt.sign({ sub: username }, jwtSecret, { expiresIn: tokenTtl });
    return res.json({ token, expiresIn: tokenTtl });
  });

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.get('/ready', (_req, res) => res.json({ status: 'ready' }));

  app.get('/metrics', metricsHandler);

  return app;
}
