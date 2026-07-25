import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'mock-key' });

export interface SecurityFinding {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  tag?: string;
}

export async function runSecurityAgent(diff: string): Promise<SecurityFinding[]> {
  console.log('[Security Agent] Analyzing PR diff for vulnerabilities...');
  
  // If no real API key is present, mock the response so the app still works for the demo
  if (!process.env.GEMINI_API_KEY) {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve([
          {
            severity: 'critical',
            title: 'SQL Injection Vulnerability',
            description: 'Unsanitized input passed directly to query builder in the changed file.',
            tag: 'Blocker'
          }
        ]);
      }, 1500); // simulate 1.5s agent thinking time
    });
  }

  // Real LLM implementation
  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: `Analyze the following code diff for security vulnerabilities (CVEs, hardcoded secrets, unguarded routes). Return ONLY a JSON array of findings with severity (critical/warning/info), title, description, and an optional tag.\n\nDiff:\n${diff}`,
    config: {
      responseMimeType: 'application/json',
    }
  });

  try {
    return JSON.parse(response.text || '[]');
  } catch (e) {
    console.error('Failed to parse security agent response', e);
    return [];
  }
}
