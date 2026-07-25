import { runSecurityAgent } from './security';
import { runDebtAgent } from './debt';
import { runReliabilityAgent } from './reliability';
import { runReviewAgent, PRAnalysisResult } from './review';

export async function orchestratePRAnalysis(diff: string): Promise<PRAnalysisResult> {
  console.log('[Orchestrator] Starting multi-agent analysis...');
  
  // 1. Run the 3 specialized agents concurrently
  const [securityFindings, debtFinding, reliabilityFindings] = await Promise.all([
    runSecurityAgent(diff),
    runDebtAgent(diff),
    runReliabilityAgent(diff)
  ]);

  console.log('[Orchestrator] Specialized agents finished. Handoff to Review agent...');

  // 2. Synthesize results with the review agent
  const finalResult = await runReviewAgent(
    diff,
    securityFindings,
    debtFinding,
    reliabilityFindings
  );

  console.log(`[Orchestrator] Analysis complete. Result: ${finalResult.status}`);
  return finalResult;
}
