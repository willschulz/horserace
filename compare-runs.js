const fs = require('fs');
const path = require('path');

const resultsDir = path.join(__dirname, 'results');
const runsDir = path.join(resultsDir, 'runs');
const indexFile = path.join(resultsDir, 'runs-index.json');

function loadRun(runId) {
  const runFile = path.join(runsDir, runId, 'all-results.json');
  if (!fs.existsSync(runFile)) {
    throw new Error(`Run ${runId} not found`);
  }
  return JSON.parse(fs.readFileSync(runFile, 'utf8'));
}

function extractMetrics(results) {
  const metrics = {};
  
  for (const target of results.targets) {
    const targetMetrics = {
      target: target.target,
      url: target.url,
      playwright: {},
      k6: {}
    };
    
    // Extract Playwright metrics
    if (target.playwright && !target.playwright.error) {
      for (const test of target.playwright.tests) {
        if (test.name === 'page_load') {
          targetMetrics.playwright.pageLoad = test.duration;
        } else if (test.name === 'dom_metrics') {
          targetMetrics.playwright.domContentLoaded = test.domContentLoaded;
          targetMetrics.playwright.domInteractive = test.domInteractive;
          targetMetrics.playwright.loadComplete = test.loadComplete;
        } else if (test.name === 'network_timing') {
          targetMetrics.playwright.ttfb = test.ttfb;
          targetMetrics.playwright.dns = test.dns;
          targetMetrics.playwright.tcp = test.tcp;
          targetMetrics.playwright.download = test.download;
        }
      }
    }
    
    // Extract k6 metrics (if available)
    if (target.k6 && !target.k6.error && target.k6.metricsFile) {
      targetMetrics.k6.hasResults = true;
      targetMetrics.k6.metricsFile = target.k6.metricsFile;
    }
    
    metrics[target.target] = targetMetrics;
  }
  
  return metrics;
}

function compareRuns(runIds) {
  if (runIds.length < 2) {
    console.error('❌ Need at least 2 runs to compare');
    process.exit(1);
  }
  
  console.log('📊 Comparing Test Runs');
  console.log('═'.repeat(80));
  console.log('');
  
  const runs = [];
  for (const runId of runIds) {
    try {
      const run = loadRun(runId);
      runs.push({
        runId: runId,
        timestamp: run.timestamp,
        metrics: extractMetrics(run)
      });
    } catch (error) {
      console.error(`❌ Failed to load run ${runId}: ${error.message}`);
      process.exit(1);
    }
  }
  
  // Sort by timestamp
  runs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  // Get all unique targets
  const allTargets = new Set();
  runs.forEach(run => {
    Object.keys(run.metrics).forEach(target => allTargets.add(target));
  });
  
  const comparisonLines = [];
  comparisonLines.push('# Test Run Comparison');
  comparisonLines.push('');
  comparisonLines.push(`**Compared Runs:** ${runIds.join(', ')}`);
  comparisonLines.push('');
  
  for (const target of allTargets) {
    console.log(`\n🎯 Target: ${target.toUpperCase()}`);
    comparisonLines.push(`## ${target.toUpperCase()}`);
    comparisonLines.push('');
    
    // Check if all runs have this target
    const hasTarget = runs.every(run => run.metrics[target]);
    if (!hasTarget) {
      console.log('   ⚠️  Not all runs include this target');
      comparisonLines.push('⚠️ **Note:** Not all runs include this target');
      comparisonLines.push('');
      continue;
    }
    
    const targetUrl = runs[0].metrics[target].url;
    comparisonLines.push(`**URL:** ${targetUrl}`);
    comparisonLines.push('');
    
    // Compare Playwright metrics
    const playwrightMetrics = ['pageLoad', 'domContentLoaded', 'domInteractive', 'ttfb', 'dns', 'tcp', 'download'];
    const availableMetrics = playwrightMetrics.filter(metric => 
      runs.some(run => run.metrics[target].playwright[metric] !== undefined)
    );
    
    if (availableMetrics.length > 0) {
      console.log('\n   🎭 Playwright Metrics:');
      comparisonLines.push('### Playwright Metrics');
      comparisonLines.push('');
      
      // Create table header
      let header = '| Metric |';
      runs.forEach(run => {
        const date = new Date(run.timestamp).toLocaleString();
        header += ` ${date} |`;
      });
      comparisonLines.push(header);
      comparisonLines.push('|' + '---|'.repeat(runs.length + 1));
      
      for (const metric of availableMetrics) {
        const values = runs.map(run => run.metrics[target].playwright[metric]);
        const allDefined = values.every(v => v !== undefined);
        
        if (allDefined) {
          const metricName = metric.replace(/([A-Z])/g, ' $1').trim();
          let row = `| ${metricName} |`;
          
          // Find min and max for highlighting
          const nums = values.map(v => parseFloat(v));
          const min = Math.min(...nums);
          const max = Math.max(...nums);
          
          values.forEach((value, idx) => {
            let display = `${value}ms`;
            if (value === min && runs.length > 1) {
              display = `**${value}ms** ⚡`; // Best (fastest)
            } else if (value === max && runs.length > 1) {
              display = `*${value}ms*`; // Worst (slowest)
            }
            row += ` ${display} |`;
          });
          
          comparisonLines.push(row);
          
          // Console output
          console.log(`      ${metricName}:`);
          values.forEach((value, idx) => {
            const date = new Date(runs[idx].timestamp).toLocaleString();
            const indicator = value === min && runs.length > 1 ? ' ⚡' : value === max && runs.length > 1 ? ' 🐌' : '';
            console.log(`         ${date}: ${value}ms${indicator}`);
          });
        }
      }
      comparisonLines.push('');
    }
    
    // k6 status
    const k6Status = runs.map(run => run.metrics[target].k6.hasResults ? '✅' : '❌');
    if (k6Status.some(s => s === '✅')) {
      console.log('\n   📊 k6 Load Tests:');
      comparisonLines.push('### k6 Load Tests');
      comparisonLines.push('');
      comparisonLines.push('| Run | Status |');
      comparisonLines.push('|-----|--------|');
      
      runs.forEach((run, idx) => {
        const date = new Date(run.timestamp).toLocaleString();
        const status = k6Status[idx];
        comparisonLines.push(`| ${date} | ${status} |`);
        console.log(`      ${date}: ${status}`);
      });
      comparisonLines.push('');
    }
  }
  
  // Save comparison
  const comparisonFile = path.join(resultsDir, 'COMPARISON.md');
  fs.writeFileSync(comparisonFile, comparisonLines.join('\n'));
  console.log(`\n📄 Comparison saved to ${comparisonFile}`);
  
  console.log('\n' + '═'.repeat(80));
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0) {
  // List available runs
  if (!fs.existsSync(indexFile)) {
    console.log('❌ No runs found. Run benchmarks first with: npm run benchmark');
    process.exit(1);
  }
  
  const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  console.log('📋 Available Test Runs:');
  console.log('');
  index.slice(0, 10).forEach((run, idx) => {
    const date = new Date(run.timestamp).toLocaleString();
    console.log(`  ${idx + 1}. ${run.runId}`);
    console.log(`     ${date}`);
    console.log(`     Targets: ${run.targets.join(', ')}`);
    console.log('');
  });
  
  if (index.length > 10) {
    console.log(`  ... and ${index.length - 10} more runs`);
  }
  
  console.log('\n💡 Usage: node compare-runs.js <runId1> <runId2> [runId3...]');
  console.log('   Example: node compare-runs.js <latest-run-id> <previous-run-id>');
} else {
  compareRuns(args);
}
