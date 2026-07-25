import { Router, Request, Response } from 'express';
import { pool } from '../db/postgres';
import { orchestratePRAnalysis } from '../agents/orchestrator';

export const apiRouter = Router();

// GET /api/dashboard/stats - Returns overview stats
apiRouter.get('/dashboard/stats', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT COUNT(*) as count FROM baselines');
    const repoCount = parseInt(result.rows[0].count) || 0;
    
    res.json({
      totalRepos: repoCount,
      openFindings: 0,
      warningCount: 0,
      prsAnalyzed: 0,
      avgDebtScore: 0,
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.json({
      totalRepos: 0,
      openFindings: 0,
      warningCount: 0,
      prsAnalyzed: 0,
      avgDebtScore: 0,
    });
  }
});

// GET /api/repositories - Returns list of monitored repos
apiRouter.get('/repositories', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT repo, findings, scanned_at, score, language FROM baselines ORDER BY scanned_at DESC');
    const repos = result.rows.map(row => ({
      name: row.repo.split('/')[1] || row.repo,
      fullName: row.repo,
      language: row.language || 'TypeScript',
      lastScan: row.scanned_at,
      score: row.score || 0,
      findings: row.findings || [],
    }));
    res.json(repos);
  } catch (err) {
    console.error('Error fetching repositories:', err);
    res.json([]);
  }
});

// GET /api/activity - Returns recent activity timeline
apiRouter.get('/activity', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM activity ORDER BY created_at DESC LIMIT 10');
    const activities = result.rows.map(row => ({
      ...row,
      time: new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' today'
    }));
    res.json(activities);
  } catch (err) {
    console.error('Error fetching activity:', err);
    res.json([]);
  }
});

// GET /api/pr/:id - Returns PR analysis details
apiRouter.get('/pr/:id', async (req: Request, res: Response) => {
  const prId = req.params.id;
  try {
    const result = await pool.query('SELECT data FROM prs WHERE id = $1', [prId]);
    if (result.rows.length > 0) {
      res.json(result.rows[0].data);
    } else {
      res.status(404).json({ error: 'PR not found' });
    }
  } catch (err) {
    console.error('Error fetching PR:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/policy - Returns current policy configuration
apiRouter.get('/policy', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT config FROM policy WHERE id = 1');
    if (result.rows.length > 0) {
      res.json(result.rows[0].config);
    } else {
      res.json({});
    }
  } catch (err) {
    console.error('Error fetching policy:', err);
    res.json({});
  }
});

// POST /api/policy - Save policy configuration
apiRouter.post('/policy', async (req: Request, res: Response) => {
  const policy = req.body;
  try {
    await pool.query('UPDATE policy SET config = $1 WHERE id = 1', [policy]);
    res.json({ success: true, policy });
  } catch (err) {
    console.error('Error saving policy:', err);
    res.status(500).json({ error: 'Failed to save policy' });
  }
});

// GET /api/repository/:name - Returns single repo details
apiRouter.get('/repository/:name', async (req: Request, res: Response) => {
  const repoName = req.params.name;
  try {
    const result = await pool.query('SELECT data FROM repositories WHERE name = $1', [repoName]);
    if (result.rows.length > 0) {
      res.json(result.rows[0].data);
    } else {
      res.status(404).json({ error: 'Repository not found' });
    }
  } catch (err) {
    console.error('Error fetching repo details:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/analysis - Trigger multi-agent PR analysis
apiRouter.post('/analysis', async (req: Request, res: Response) => {
  const diff = req.body.diff || 'mock diff content';
  try {
    const result = await orchestratePRAnalysis(diff);
    res.json({ success: true, result });
  } catch (err) {
    console.error('Error running agents:', err);
    res.status(500).json({ error: 'Failed to run analysis agents' });
  }
});
