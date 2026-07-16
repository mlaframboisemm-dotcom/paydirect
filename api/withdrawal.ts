import express from 'express';

export const withdrawalRouter = express.Router();

withdrawalRouter.post('/disburse', (req: any, res: any) => {
  if (!req.user) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required' });
  }
  res.status(200).json({ ok: true, message: 'Withdrawal router ready' });
});

withdrawalRouter.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});
