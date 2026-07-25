import { App } from '@octokit/app';
import { Octokit } from '@octokit/rest';

// We parse the private key explicitly to handle escaped newlines if it's passed from .env
const privateKey = process.env.GITHUB_PRIVATE_KEY
  ? process.env.GITHUB_PRIVATE_KEY.replace(/\\n/g, '\n')
  : '';

export const githubApp = new App({
  appId: process.env.GITHUB_APP_ID || '',
  privateKey: privateKey,
  webhooks: {
    secret: process.env.GITHUB_WEBHOOK_SECRET || 'mock-secret',
  },
});

export async function getOctokitForInstallation(installationId: number): Promise<Octokit> {
  const octokit = await githubApp.getInstallationOctokit(installationId);
  return octokit as unknown as Octokit;
}
