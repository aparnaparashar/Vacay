import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'mock-key' });

export interface ReliabilityFinding {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  tag?: string;
}

export async function runReliabilityAgent(diff: string): Promise<ReliabilityFinding[]> {
  console.log('[Reliability Agent] Analyzing PR diff for performance/reliability regressions...');
  
  if (!process.env.GEMINI_API_KEY) {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve([
          {
            severity: 'info',
            title: 'Performance Suggestion',
            description: 'Consider caching the session lookup to reduce latency under load.',
          }
        ]);
      }, 1200); 
    });
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: `Analyze the following code diff for reliability/performance regressions (e.g. sync calls in hot loops, missing caching). Return ONLY a JSON array of findings with severity (critical/warning/info), title, description, and an optional tag.\n\nDiff:\n${diff}`,
    config: {
      responseMimeType: 'application/json',
    }
  });

  try {
    return JSON.parse(response.text || '[]');
  } catch (e) {
    console.error('Failed to parse reliability agent response', e);
    return [];
  }
}
