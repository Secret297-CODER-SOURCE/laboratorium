import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { handleTunnelProxy } from '../services/tunnel.service.js';

const router = Router();

const tunnelLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Забагато запитів до тунелю', code: 'TUNNEL_RATE_LIMIT' },
});

router.use(tunnelLimiter);

router.all('*', (req, res) => {
  const pathOnly = req.originalUrl.split('?')[0];
  const prefix = '/lab/t/';
  if (!pathOnly.startsWith(prefix)) {
    return res.status(404).json({ error: 'Невірний шлях тунелю' });
  }
  const rest = pathOnly.slice(prefix.length);
  const slash = rest.indexOf('/');
  const token = slash === -1 ? rest : rest.slice(0, slash);
  const forwardPath = slash === -1 ? '/' : rest.slice(slash);
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  if (!token) {
    return res.status(404).json({ error: 'Токен не вказано' });
  }
  return handleTunnelProxy(req, res, token, forwardPath + query);
});

export default router;
