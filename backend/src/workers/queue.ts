import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../db/redis';
import { OrchestratorService } from '../services/orchestrator';

// Define Queue
export const scanQueue = new Queue('scan-jobs', {
  connection: redis,
});

// Worker to process jobs
export const scanWorker = new Worker(
  'scan-jobs',
  async (job: Job) => {
    console.log(`Processing job ${job.id} of type ${job.name}`);
    
    if (job.name === 'baseline-scan') {
      console.log('Running baseline scan...', job.data);
      await OrchestratorService.runBaselineScan(job.data.repoFullName, job.data.cloneUrl, job.data.installationId);
    } else if (job.name === 'diff-scan') {
      console.log('Running diff-scoped scan...', job.data);
      const cloneUrl = `https://github.com/${job.data.repoFullName}.git`;
      await OrchestratorService.runDiffScopedScan(job.data.repoFullName, job.data.prNumber, job.data.installationId, job.data.baseSha, job.data.headSha, cloneUrl);
    }
    
    return { success: true };
  },
  { connection: redis }
);

scanWorker.on('completed', (job) => {
  console.log(`Job ${job.id} completed successfully`);
});

scanWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});
