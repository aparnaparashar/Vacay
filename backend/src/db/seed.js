const { Pool } = require('pg');
require('dotenv').config({ path: __dirname + '/../../.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function seed() {
  try {
    // Drop existing
    await pool.query('DROP TABLE IF EXISTS baselines CASCADE;');
    await pool.query('DROP TABLE IF EXISTS activity CASCADE;');
    await pool.query('DROP TABLE IF EXISTS policy CASCADE;');
    await pool.query('DROP TABLE IF EXISTS prs CASCADE;');
    await pool.query('DROP TABLE IF EXISTS repositories CASCADE;');
    
    // 1. Baselines
    await pool.query(`
      CREATE TABLE baselines (
        repo VARCHAR PRIMARY KEY,
        findings JSONB,
        scanned_at TIMESTAMP,
        score INTEGER DEFAULT 100,
        language VARCHAR DEFAULT 'TypeScript'
      );
    `);
    
    await pool.query(`
      INSERT INTO baselines (repo, findings, scanned_at, score, language) VALUES 
      ('org/core-auth-service', '[]', NOW() - INTERVAL '10 minutes', 85, 'Go'),
      ('org/frontend-dashboard', '[]', NOW() - INTERVAL '1 hour', 92, 'TypeScript'),
      ('org/data-pipeline-v2', '[]', NOW() - INTERVAL '5 minutes', 45, 'Python');
    `);

    // 2. Activity
    await pool.query(`
      CREATE TABLE activity (
        id SERIAL PRIMARY KEY,
        type VARCHAR,
        icon VARCHAR,
        title VARCHAR,
        detail TEXT,
        repo VARCHAR,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    
    await pool.query(`
      INSERT INTO activity (type, icon, title, detail, repo, created_at) VALUES 
      ('success', 'check', 'PR #1024 merged in frontend-dashboard', NULL, 'frontend-dashboard', NOW() - INTERVAL '2 minutes'),
      ('critical', 'warning', 'Critical vulnerability found in data-pipeline-v2', 'CVE-2024-XXXX: SQL Injection', 'data-pipeline-v2', NOW() - INTERVAL '15 minutes'),
      ('warning', 'update', 'Debt score degraded in core-auth-service', NULL, 'core-auth-service', NOW() - INTERVAL '1 hour'),
      ('success', 'build', 'Routine scan completed across 12 repositories.', NULL, NULL, NOW() - INTERVAL '3 hours');
    `);

    // 3. Policy
    await pool.query(`
      CREATE TABLE policy (
        id INTEGER PRIMARY KEY,
        config JSONB
      );
    `);
    
    await pool.query(`
      INSERT INTO policy (id, config) VALUES (1, '{"blockOnCriticalCVE": true, "blockOnHardcodedSecret": true, "debtThreshold": 10, "costMonthlyLimit": 500, "costHardCap": 10000}');
    `);

    // 4. PRs
    await pool.query(`
      CREATE TABLE prs (
        id VARCHAR PRIMARY KEY,
        data JSONB
      );
    `);

    await pool.query(`
      INSERT INTO prs (id, data) VALUES ('452', '{
        "id": "452",
        "title": "Update Auth Middleware",
        "number": 452,
        "branch": { "base": "arch-core/main", "head": "feature/auth-middleware-v2" },
        "status": "blocked",
        "deltas": {
          "security": { "value": "+2", "label": "Critical Findings", "detail": "CVE-2023-4528 introduced in deps." },
          "debt": { "value": "-5%", "label": "Complexity Score", "detail": "Refactored JWT validation logic." },
          "cost": { "value": "$0", "label": "/mo est. impact", "detail": "No new cloud resources detected." }
        },
        "findings": [
          { "id": 1, "severity": "critical", "title": "SQL Injection Vulnerability", "description": "Unsanitized input passed to SessionDB query builder in validateToken().", "tag": "Blocker" },
          { "id": 2, "severity": "warning", "title": "Deprecated Method Usage", "description": "jwt.verify() signature used is deprecated in jsonwebtoken v9.x." },
          { "id": 3, "severity": "info", "title": "Performance Suggestion", "description": "Consider caching valid token hashes in Redis to reduce DB load during high traffic spikes." }
        ],
        "diff": {
          "file": "src/middleware/auth.ts",
          "additions": 14,
          "deletions": 3
        }
      }');
    `);

    // 5. Repositories Details
    await pool.query(`
      CREATE TABLE repositories (
        name VARCHAR PRIMARY KEY,
        data JSONB
      );
    `);

    await pool.query(`
      INSERT INTO repositories (name, data) VALUES ('cloud-gateway', '{
        "name": "cloud-gateway",
        "fullName": "org/cloud-gateway",
        "status": "active",
        "description": "Main ingress controller and API gateway routing traffic to internal microservices.",
        "securityScore": 84,
        "debtScore": 62,
        "codeSize": "1.2M",
        "contributors": 24,
        "openPRs": 8
      }');
    `);

    console.log("Database seeded successfully!");
  } catch (err) {
    console.error("Seeding error:", err);
  } finally {
    await pool.end();
  }
}

seed();
