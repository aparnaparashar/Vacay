import { Router, Request, Response } from 'express';
import { scanQueue } from '../workers/queue';

export const webhookRouter = Router();

webhookRouter.post('/github', async (req: Request, res: Response) => {
  const event = req.headers['x-github-event'];
  const payload = req.body;

  console.log(`Received GitHub Webhook: ${event}`);

  try {
    if (event === 'installation' && payload.action === 'created') {
      // Baseline Scan when App is installed
      const repo = payload.repositories[0];
      await scanQueue.add('baseline-scan', {
        installationId: payload.installation.id,
        repoFullName: repo.full_name,
        cloneUrl: `https://github.com/${repo.full_name}.git`,
      });
      console.log(`Queued baseline-scan for ${repo.full_name}`);
    } 
    else if (event === 'pull_request' && (payload.action === 'opened' || payload.action === 'synchronize')) {
      // Diff-Scoped Scan for PRs
      await scanQueue.add('diff-scan', {
        installationId: payload.installation.id,
        repoFullName: payload.repository.full_name,
        prNumber: payload.pull_request.number,
        baseSha: payload.pull_request.base.sha,
        headSha: payload.pull_request.head.sha,
      });
      console.log(`Queued diff-scan for PR #${payload.pull_request.number} in ${payload.repository.full_name}`);
    }
    // Also handle push to default branch to refresh baseline
    else if (event === 'push') {
      const defaultBranch = payload.repository.default_branch;
      const ref = payload.ref;
      if (ref === `refs/heads/${defaultBranch}`) {
        await scanQueue.add('baseline-scan', {
          installationId: payload.installation.id,
          repoFullName: payload.repository.full_name,
          cloneUrl: `https://github.com/${payload.repository.full_name}.git`,
        });
        console.log(`Queued baseline-scan update for push to ${defaultBranch}`);
      }
    }

    res.status(202).send('Accepted');
  } catch (error) {
    console.error('Error queuing webhook event:', error);
    res.status(500).send('Internal Server Error');
  }
});
