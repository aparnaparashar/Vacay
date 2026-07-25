import { RepoCloner } from './repoCloner';
import { GraphParser } from './graphParser';
import { Scanner } from './scanner';
import { PolicyEngine } from './policyEngine';
import { GitHubService } from './github';
import { pool } from '../db/postgres';
import { orchestratePRAnalysis } from '../agents/orchestrator';

export class OrchestratorService {
  static async runBaselineScan(repoFullName: string, cloneUrl: string, installationId: number) {
    console.log(`Starting baseline scan for ${repoFullName}...`);
    let tempDir = '';
    
    try {
      // 1. Clone repository
      tempDir = await RepoCloner.cloneToTemp(cloneUrl);
      
      // 2. Parse graph & save to Neo4j
      await GraphParser.parseAndSaveGraph(repoFullName, tempDir);
      
      // 3. Run SAST on whole repo
      const findings = await Scanner.runSast(tempDir);
      
      // 4. Save findings to Postgres baseline table
      await pool.query(
        `INSERT INTO baselines (repo, findings, scanned_at) VALUES ($1, $2, NOW()) 
         ON CONFLICT (repo) DO UPDATE SET findings = $2, scanned_at = NOW()`,
        [repoFullName, JSON.stringify(findings)]
      );
      
      console.log(`Baseline scan completed for ${repoFullName}. Findings: ${findings.length}`);
    } catch (err) {
      console.error(`Error during baseline scan for ${repoFullName}:`, err);
    } finally {
      if (tempDir) await RepoCloner.cleanup(tempDir);
    }
  }

  static async runDiffScopedScan(repoFullName: string, prNumber: number, installationId: number, baseSha: string, headSha: string, cloneUrl: string) {
    console.log(`Starting diff-scoped scan for ${repoFullName} PR #${prNumber}...`);
    let tempDir = '';
    
    try {
      // 0. Notify GitHub that check is in progress
      await GitHubService.postCheckRun(
        repoFullName, headSha, installationId, 'Architecture Review', 'in_progress'
      );

      // 1. Fetch Diff to find changed files
      const diff = await GitHubService.getPullRequestDiff(repoFullName, prNumber, installationId);
      const changedFiles = this.extractChangedFilesFromDiff(diff);
      
      if (changedFiles.length === 0) {
        await GitHubService.postCheckRun(
          repoFullName, headSha, installationId, 'Architecture Review', 'completed', 'success',
          { title: 'No changes', summary: 'No architectural files were changed.' }
        );
        return;
      }

      // 2. Clone repo at headSha
      tempDir = await RepoCloner.cloneToTemp(cloneUrl); // We'd ideally checkout headSha here
      
      // 3. Find affected subgraph from Neo4j (N-hops)
      const affectedFiles = await GraphParser.getAffectedSubgraph(repoFullName, changedFiles);
      console.log(`PR modified ${changedFiles.length} files, affecting ${affectedFiles.length} files in total.`);
      
      // 4. Run SAST ONLY on affected subgraph
      const findings = await Scanner.runSast(tempDir, affectedFiles);
      
      // 5. Run LLM Multi-Agent Orchestrator on the Diff
      const agentResult = await orchestratePRAnalysis(diff);
      
      // 6. Evaluate Policy (Scanner Rules + Agent Status)
      const result = PolicyEngine.evaluate(findings);
      
      // Decide final conclusion
      let conclusion: 'success' | 'failure' | 'neutral' = result.status;
      if (agentResult.status === 'BLOCK') conclusion = 'failure';
      
      let markdownText = `### Affected Subgraph Checked:\n${affectedFiles.map(f => '- ' + f).join('\n')}\n\n`;
      
      markdownText += `### AI Agent Analysis:\n`;
      markdownText += `- **Security Delta**: ${agentResult.deltas.security.value} (${agentResult.deltas.security.detail})\n`;
      markdownText += `- **Debt Delta**: ${agentResult.deltas.debt.value} (${agentResult.deltas.debt.detail})\n\n`;
      
      if (agentResult.findings.length > 0) {
        markdownText += `#### Agent Findings:\n${agentResult.findings.map(f => `- **${f.severity.toUpperCase()}**: ${f.title} - ${f.description}`).join('\n')}\n\n`;
      }

      if (findings.length > 0) {
        markdownText += `### Static SAST Findings:\n${findings.map(f => `- **${f.severity}**: ${f.file} -> ${f.message}`).join('\n')}`;
      }

      // 7. Post Check Run back to GitHub
      await GitHubService.postCheckRun(
        repoFullName, headSha, installationId, 'Architecture Review', 'completed', conclusion,
        {
          title: conclusion === 'failure' ? 'Architectural Violations Detected' : 'Architecture Checks Passed',
          summary: result.summary,
          text: markdownText
        }
      );
      console.log(`Diff-scoped scan completed for PR #${prNumber}. Status: ${conclusion}`);
      
    } catch (err) {
      console.error(`Error during diff scan for ${repoFullName} PR #${prNumber}:`, err);
      await GitHubService.postCheckRun(
        repoFullName, headSha, installationId, 'Architecture Review', 'completed', 'neutral',
        { title: 'Internal Error', summary: 'The scan failed to complete due to an internal error.' }
      );
    } finally {
      if (tempDir) await RepoCloner.cleanup(tempDir);
    }
  }

  private static extractChangedFilesFromDiff(diff: string): string[] {
    const files: string[] = [];
    const lines = diff.split('\n');
    for (const line of lines) {
      if (line.startsWith('diff --git a/')) {
        const parts = line.split(' b/');
        if (parts.length === 2) {
          files.push(parts[1].trim());
        }
      }
    }
    return [...new Set(files)]; // Unique files
  }
}
