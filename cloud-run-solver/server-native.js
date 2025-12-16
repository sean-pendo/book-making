const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.text({ limit: '50mb', type: 'text/plain' }));

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    solver: 'highs-native',
    timestamp: new Date().toISOString()
  });
});

// Health check for Cloud Run
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', solver: 'native-highs' });
});

// Solve endpoint using native HiGHS binary
app.post('/solve', async (req, res) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  
  try {
    // Accept LP string from body
    let lpString;
    if (typeof req.body === 'string') {
      lpString = req.body;
    } else if (req.body.lp) {
      lpString = req.body.lp;
    } else {
      return res.status(400).json({ 
        error: 'Missing LP string. Send as plain text or JSON with "lp" field',
        status: 'error'
      });
    }

    console.log(`[${requestId}] Received LP: ${lpString.length} chars, ${lpString.split('\n').length} lines`);

    // Write LP to temp file
    const tempDir = os.tmpdir();
    const lpFile = path.join(tempDir, `problem_${requestId}.lp`);
    const solFile = path.join(tempDir, `solution_${requestId}.sol`);
    
    fs.writeFileSync(lpFile, lpString);
    console.log(`[${requestId}] LP written to ${lpFile}`);

    // Run native HiGHS
    const result = await runHiGHS(lpFile, solFile, requestId);
    
    // Clean up temp files
    try {
      fs.unlinkSync(lpFile);
      if (fs.existsSync(solFile)) fs.unlinkSync(solFile);
    } catch (e) {
      // Ignore cleanup errors
    }

    const solveTime = Date.now() - startTime;
    console.log(`[${requestId}] Completed in ${solveTime}ms, status: ${result.status}`);

    res.json({
      status: result.status,
      objectiveValue: result.objectiveValue,
      columns: result.columns,
      solveTimeMs: solveTime,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const solveTime = Date.now() - startTime;
    console.error(`[${requestId}] Error after ${solveTime}ms:`, error.message);
    
    res.status(500).json({
      error: error.message,
      status: 'error',
      solveTimeMs: solveTime
    });
  }
});

// Run native HiGHS binary
function runHiGHS(lpFile, solFile, requestId) {
  return new Promise((resolve, reject) => {
    // HiGHS CLI: minimal options, let it auto-detect settings
    const args = [
      lpFile,
      '--solution_file', solFile
    ];
    
    console.log(`[${requestId}] Running: highs ${args.join(' ')}`);
    
    const highs = spawn('highs', args);
    
    let stdout = '';
    let stderr = '';
    
    highs.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    highs.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    highs.on('close', (code) => {
      console.log(`[${requestId}] HiGHS exited with code ${code}`);
      
      if (code !== 0 && !stdout.includes('Optimal')) {
        reject(new Error(`HiGHS failed with code ${code}: ${stderr || stdout}`));
        return;
      }
      
      // Parse solution
      const result = parseSolution(stdout, solFile, requestId);
      resolve(result);
    });
    
    highs.on('error', (err) => {
      reject(new Error(`Failed to run HiGHS: ${err.message}`));
    });
  });
}

// Parse HiGHS output and solution file
function parseSolution(stdout, solFile, requestId) {
  const result = {
    status: 'Unknown',
    objectiveValue: 0,
    columns: {}
  };
  
  // Parse status from stdout
  if (stdout.includes('Optimal')) {
    result.status = 'Optimal';
  } else if (stdout.includes('Infeasible')) {
    result.status = 'Infeasible';
  } else if (stdout.includes('Time limit reached')) {
    result.status = 'Time limit';
  }
  
  // Parse objective value
  const objMatch = stdout.match(/Objective value:\s*([\d.e+-]+)/i);
  if (objMatch) {
    result.objectiveValue = parseFloat(objMatch[1]);
  }
  
  // Parse solution file if exists
  if (fs.existsSync(solFile)) {
    try {
      const solContent = fs.readFileSync(solFile, 'utf8');
      const lines = solContent.split('\n');
      
      let inColumns = false;
      for (const line of lines) {
        if (line.startsWith('# Columns')) {
          inColumns = true;
          continue;
        }
        if (line.startsWith('#') && inColumns) {
          break;
        }
        if (inColumns && line.trim()) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 2) {
            const varName = parts[0];
            const value = parseFloat(parts[1]);
            // Only include non-zero values to keep response small
            if (Math.abs(value) > 0.0001) {
              result.columns[varName] = { Primal: value };
            }
          }
        }
      }
      
      console.log(`[${requestId}] Parsed ${Object.keys(result.columns).length} non-zero variables`);
    } catch (e) {
      console.error(`[${requestId}] Failed to parse solution file:`, e.message);
    }
  }
  
  return result;
}

// Start server
const PORT = process.env.PORT || 8080;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Native HiGHS solver service running on port ${PORT}`);
});

