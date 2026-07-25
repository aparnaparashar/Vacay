import { ScanFinding } from './scanner';

export class PolicyEngine {
  static evaluate(findings: ScanFinding[]): {
    status: 'success' | 'failure' | 'neutral';
    summary: string;
  } {
    const errors = findings.filter(f => f.severity === 'ERROR');
    const warnings = findings.filter(f => f.severity === 'WARNING');
    
    if (errors.length > 0) {
      return {
        status: 'failure',
        summary: `Blocked: Found ${errors.length} critical architectural/security violations.`
      };
    }
    
    if (warnings.length > 0) {
      return {
        status: 'neutral', // Maps to a warning state in GitHub Checks if set as neutral
        summary: `Warning: Found ${warnings.length} architectural issues. Proceed with caution.`
      };
    }
    
    return {
      status: 'success',
      summary: 'All architectural checks passed.'
    };
  }
}
