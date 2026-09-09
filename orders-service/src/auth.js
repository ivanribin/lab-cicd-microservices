import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? '';

  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing bearer token' });
  }

  try {
    req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: 'invalid token' });
  }
}
