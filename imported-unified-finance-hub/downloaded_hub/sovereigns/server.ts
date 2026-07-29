/**
 * Deprecated legacy sample server.
 * This file is intentionally disabled to prevent accidental non-production runtime usage.
 */

import express from 'express';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '1mb' }));

app.all('*', (_req, res) => {
  return res.status(410).json({
    success: false,
    error: 'LEGACY_SAMPLE_DISABLED',
    message: 'This legacy sample server is disabled. Use the root server.ts runtime.'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[legacy-disabled] sovereigns/server.ts is disabled on port ${PORT}`);
});
