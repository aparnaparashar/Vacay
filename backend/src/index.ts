import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors({ origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'], credentials: true }));
app.use(express.json());

import { webhookRouter } from './routes/webhooks';
import { apiRouter } from './routes/api';
import { pool } from './db/postgres';

// Routes
app.use('/api/webhooks', webhookRouter);
app.use('/api', apiRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'architecture-reviewer-backend' });
});

const initDb = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS baselines (
      repo VARCHAR(255) PRIMARY KEY,
      findings JSONB NOT NULL,
      scanned_at TIMESTAMP NOT NULL
    );
  `);
};

initDb().then(() => {
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
