import simpleGit from 'simple-git';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export class RepoCloner {
  static async cloneToTemp(cloneUrl: string): Promise<string> {
    const hash = crypto.randomBytes(16).toString('hex');
    const tempDir = path.join('/tmp', `arch-reviewer-${hash}`);
    
    await fs.mkdir(tempDir, { recursive: true });
    
    const git = simpleGit();
    console.log(`Cloning ${cloneUrl} into ${tempDir}...`);
    await git.clone(cloneUrl, tempDir);
    
    return tempDir;
  }

  static async cleanup(tempDir: string) {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error(`Failed to cleanup temp dir ${tempDir}`, error);
    }
  }

  static async getChurnMetrics(tempDir: string): Promise<Record<string, number>> {
    const git = simpleGit(tempDir);
    
    // Get commit counts per file (churn)
    const log = await git.raw(['log', '--name-only', '--format=', '--', '.']);
    const lines = log.split('\n').filter(l => l.trim() !== '');
    
    const churn: Record<string, number> = {};
    for (const file of lines) {
      churn[file] = (churn[file] || 0) + 1;
    }
    
    return churn;
  }
}
