const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.text({ limit: '50mb', type: 'text/plain' }));

let highs = null;
let highsReady = false;

// Initialize HiGHS
async function initHiGHS() {
  try {
    const highsModule = await import('highs');
    highs = await highsModule.default();
    highsReady = true;
    console.log('[HiGHS] Solver initialized successfully');
  } catch (error) {
    console.error('[HiGHS] Failed to initialize:', error);
  }
}

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    solver: 'highs',
    ready: highsReady,
    timestamp: new Date().toISOString()
  });
});

// Health check for Cloud Run
app.get('/health', (req, res) => {
  if (highsReady) {
    res.json({ status: 'healthy', solver: 'ready' });
  } else {
    res.status(503).json({ status: 'unhealthy', solver: 'not ready' });
  }
});

// Solve endpoint
app.post('/solve', async (req, res) => {
  const startTime = Date.now();
  
  if (!highsReady) {
    return res.status(503).json({ 
      error: 'Solver not ready', 
      status: 'error' 
    });
  }

  try {
    // Accept LP string from body (JSON or plain text)
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

    console.log(`[Solve] Received LP: ${lpString.length} chars, ${lpString.split('\n').length} lines`);

    // Extract problem stats
    const varMatch = lpString.match(/Binary\s+([\s\S]*?)(?:End|$)/i);
    const binaryVars = varMatch ? varMatch[1].trim().split(/\s+/).filter(v => v).length : 0;
    
    console.log(`[Solve] Binary variables: ~${binaryVars}`);

    // Solve with options for stability
    const solution = highs.solve(lpString, {
      mip_rel_gap: 0.01,  // 1% gap for faster solving
      time_limit: 300,     // 5 minute max
      presolve: 'on'
    });

    const solveTime = Date.now() - startTime;
    
    console.log(`[Solve] Completed in ${solveTime}ms, status: ${solution.Status}`);

    // Return solution
    res.json({
      status: solution.Status,
      objectiveValue: solution.ObjectiveValue,
      columns: solution.Columns,
      solveTimeMs: solveTime,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const solveTime = Date.now() - startTime;
    console.error(`[Solve] Error after ${solveTime}ms:`, error.message);
    
    res.status(500).json({
      error: error.message,
      status: 'error',
      solveTimeMs: solveTime
    });
  }
});

// Start server
const PORT = process.env.PORT || 8080;

initHiGHS().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] HiGHS solver service running on port ${PORT}`);
  });
});





