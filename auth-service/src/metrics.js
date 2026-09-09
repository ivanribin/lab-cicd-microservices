import client from '@prometheus-io/client';

export const register = new client.Registry();

client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.3, 1, 3],
  registers: [register],
});

export function metricsMiddleware(req, res, next) {
  const stopTimer = httpRequestDuration.startTimer();

  res.on('finish', () => {
    const labels = {
      method: req.method,
      route: req.route?.path ?? req.path,
      status: res.statusCode,
    };
    httpRequestsTotal.inc(labels);
    stopTimer(labels);
  });

  next();
}

export async function metricsHandler(_req, res) {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
}
