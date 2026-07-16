import express from 'express';

export const withdrawalRouter = express.Router();

function requireRouterAuth(req: any, res: any, next: any) {
  if (!req.user) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required' });
  }
  next();
}

withdrawalRouter.post('/disburse', requireRouterAuth, (req: any, res: any) => {
  res.status(200).json({ ok: true, message: 'Withdrawal router ready' });
});

withdrawalRouter.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});
