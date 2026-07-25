import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'mock-key' });

export interface DebtFinding {
  scoreDelta: number; // e.g. -5 for improving debt, +5 for adding debt
  label: string;
  detail: string;
}

export async function runDebtAgent(diff: string): Promise<DebtFinding> {
  console.log('[Debt Agent] Analyzing PR diff for tech debt...');
  
  if (!process.env.GEMINI_API_KEY) {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          scoreDelta: -5,
          label: 'Complexity Score',
          detail: 'Improves maintainability by refactoring monolithic function.'
        });
      }, 1000); 
    });
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: `Analyze the following code diff for technical debt. Calculate a scoreDelta (negative means improved debt, positive means worsened debt). Return ONLY a JSON object with scoreDelta (number), label (string), and detail (string).\n\nDiff:\n${diff}`,
    config: {
      responseMimeType: 'application/json',
    }
  });

  try {
    return JSON.parse(response.text || '{}');
  } catch (e) {
    console.error('Failed to parse debt agent response', e);
    return { scoreDelta: 0, label: 'Unknown', detail: 'Analysis failed.' };
  }
}
