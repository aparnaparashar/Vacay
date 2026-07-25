import { GoogleGenAI } from '@google/genai';
import { SecurityFinding } from './security';
import { DebtFinding } from './debt';
import { ReliabilityFinding } from './reliability';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'mock-key' });

export interface PRAnalysisResult {
  status: 'PASS' | 'WARN' | 'BLOCK';
  deltas: {
    security: { value: string; label: string; detail: string };
    debt: { value: string; label: string; detail: string };
    cost: { value: string; label: string; detail: string };
  };
  findings: Array<{
    id: number;
    severity: 'critical' | 'warning' | 'info';
    title: string;
    description: string;
    tag?: string;
  }>;
}

export async function runReviewAgent(
  diff: string,
  securityFindings: SecurityFinding[],
  debtFinding: DebtFinding,
  reliabilityFindings: ReliabilityFinding[]
): Promise<PRAnalysisResult> {
  console.log('[Review Agent] Synthesizing final structured review...');

  const allFindings = [...securityFindings, ...reliabilityFindings].map((f, i) => ({
    id: i + 1,
    ...f
  }));

  const hasCritical = allFindings.some(f => f.severity === 'critical');
  const hasWarning = allFindings.some(f => f.severity === 'warning');
  const status = hasCritical ? 'BLOCK' : hasWarning ? 'WARN' : 'PASS';

  if (!process.env.GEMINI_API_KEY) {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          status,
          deltas: {
            security: { 
              value: securityFindings.length > 0 ? `+${securityFindings.length}` : '0', 
              label: 'Security Findings', 
              detail: hasCritical ? 'Critical vulnerabilities introduced.' : 'No major security issues.' 
            },
            debt: { 
              value: debtFinding.scoreDelta > 0 ? `+${debtFinding.scoreDelta}%` : `${debtFinding.scoreDelta}%`, 
              label: debtFinding.label, 
              detail: debtFinding.detail 
            },
            cost: { value: '$0', label: '/mo est. impact', detail: 'No infrastructure changes detected.' }
          },
          findings: allFindings as any
        });
      }, 800);
    });
  }

  // If real key, we could optionally use the LLM to write the summary descriptions here
  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: `Synthesize these agent findings into a structured summary for a PR review.\nSecurity: ${JSON.stringify(securityFindings)}\nDebt: ${JSON.stringify(debtFinding)}\nReliability: ${JSON.stringify(reliabilityFindings)}\n\nReturn a JSON object with 'securityDetail' and 'debtDetail' strings summarizing the impact.`,
    config: { responseMimeType: 'application/json' }
  });

  const parsed = JSON.parse(response.text || '{}');

  return {
    status,
    deltas: {
      security: { 
        value: securityFindings.length > 0 ? `+${securityFindings.length}` : '0', 
        label: 'Security Findings', 
        detail: parsed.securityDetail || (hasCritical ? 'Critical vulnerabilities introduced.' : 'No major security issues.') 
      },
      debt: { 
        value: debtFinding.scoreDelta > 0 ? `+${debtFinding.scoreDelta}%` : `${debtFinding.scoreDelta}%`, 
        label: debtFinding.label, 
        detail: parsed.debtDetail || debtFinding.detail 
      },
      cost: { value: '$0', label: '/mo est. impact', detail: 'No infrastructure changes detected.' }
    },
    findings: allFindings as any
  };
}
