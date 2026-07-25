import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import dotenv from 'dotenv';

dotenv.config();

export class GitHubService {
  private static getClient(installationId: number) {
    const appId = process.env.GITHUB_APP_ID!;
    const privateKey = process.env.GITHUB_PRIVATE_KEY!.replace(/\\n/g, '\n');
    
    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId,
        privateKey,
        installationId,
      },
    });
  }

  static async getPullRequestDiff(repoFullName: string, prNumber: number, installationId: number) {
    const octokit = this.getClient(installationId);
    const [owner, repo] = repoFullName.split('/');
    
    const response = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
      mediaType: {
        format: 'diff'
      }
    });
    
    // The diff string
    return response.data as unknown as string;
  }

  static async postCheckRun(
    repoFullName: string,
    headSha: string,
    installationId: number,
    name: string,
    status: 'in_progress' | 'completed',
    conclusion?: 'success' | 'failure' | 'neutral',
    output?: { title: string; summary: string; text?: string }
  ) {
    const octokit = this.getClient(installationId);
    const [owner, repo] = repoFullName.split('/');

    await octokit.rest.checks.create({
      owner,
      repo,
      name,
      head_sha: headSha,
      status,
      conclusion,
      output
    });
  }
}
