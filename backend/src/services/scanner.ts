import fs from 'fs/promises';
import path from 'path';

export interface ScanFinding {
  ruleId: string;
  message: string;
  file: string;
  severity: 'WARNING' | 'ERROR';
}

export class Scanner {
  /**
   * Dummy implementation of a SAST/Secret scanner.
   * In a real implementation, this would spawn `semgrep` or `gitleaks` via child_process.
   */
  static async runSast(dirPath: string, filesToScan?: string[]): Promise<ScanFinding[]> {
    const findings: ScanFinding[] = [];
    
    // Fallback: If no specific files, scan all .ts/.js
    const files = filesToScan || await this.getAllFiles(dirPath);
    
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      try {
        const content = await fs.readFile(fullPath, 'utf8');
        
        // Dummy secret check
        if (content.match(/API_KEY\s*=\s*['"][a-zA-Z0-9]{20,}['"]/)) {
          findings.push({
            ruleId: 'hardcoded-api-key',
            message: 'Detected a hardcoded API key.',
            file: file,
            severity: 'ERROR'
          });
        }
        
        // Dummy architecture rule check: synchronous call in hot path
        if (content.match(/fs\.readFileSync/)) {
          findings.push({
            ruleId: 'sync-fs-call',
            message: 'Synchronous fs call detected. Use async/await.',
            file: file,
            severity: 'WARNING'
          });
        }
      } catch (err) {
        // file might not exist or be binary
      }
    }
    
    return findings;
  }

  private static async getAllFiles(dir: string, fileList: string[] = [], baseDir = dir): Promise<string[]> {
    const files = await fs.readdir(dir);
    for (const file of files) {
      if (file === 'node_modules' || file === '.git') continue;
      
      const fullPath = path.join(dir, file);
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        await this.getAllFiles(fullPath, fileList, baseDir);
      } else if (file.endsWith('.ts') || file.endsWith('.js')) {
        fileList.push(path.relative(baseDir, fullPath));
      }
    }
    return fileList;
  }
}
