const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { runPlaywrightBenchmark } = require('./playwright-benchmark.js');

// Create results directory if it doesn't exist
const resultsDir = path.join(__dirname, 'results');
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir, { recursive: true });
}

// Create runs directory for storing individual run results
const runsDir = path.join(resultsDir, 'runs');
if (!fs.existsSync(runsDir)) {
  fs.mkdirSync(runsDir, { recursive: true });
}

// Load target configurations
let targets;
try {
  const targetsConfig = JSON.parse(fs.readFileSync('targets.json', 'utf8'));
  targets = targetsConfig.targets;
  
  if (!targets || typeof targets !== 'object') {
    throw new Error('Invalid targets.json format: missing "targets" object');
  }
} catch (error) {
  console.error('❌ Failed to load targets.json:', error.message);
  console.error('   Please ensure targets.json exists and is valid JSON.');
  process.exit(1);
}

// Parse command line arguments
const args = process.argv.slice(2);
const selectedTargets = args.length > 0 ? args : Object.keys(targets);

console.log('🏇 Horserace Benchmarking Harness');
console.log('==================================\n');

async function runK6Benchmark(targetName, targetUrl, runDir) {
  console.log(`\n📊 Running k6 load test for ${targetName}...`);
  
  const outputFile = path.join(runDir, `${targetName}-k6-results.json`);
  
  try {
    // Check if k6 is installed
    try {
      execSync('k6 version', { stdio: 'pipe' });
    } catch (error) {
      console.log('⚠️  k6 not found. Skipping k6 tests.');
      console.log('   Install k6: https://k6.io/docs/getting-started/installation/');
      return null;
    }

    const command = `k6 run --out json=${outputFile} -e TARGET_URL=${targetUrl} k6-load-test.js`;
    
    execSync(command, { 
      stdio: 'inherit',
      env: { ...process.env, TARGET_URL: targetUrl }
    });
    
    console.log(`✅ k6 test completed for ${targetName}`);
    
    // Parse k6 results
    let metrics = [];
    try {
      if (fs.existsSync(outputFile)) {
        const rawResults = fs.readFileSync(outputFile, 'utf8');
        if (rawResults.trim()) {
          const lines = rawResults.trim().split('\n').filter(line => line.trim());
          metrics = lines
            .map(line => {
              try {
                return JSON.parse(line);
              } catch (e) {
                return null;
              }
            })
            .filter(m => m && m.type === 'Point');
        }
      }
    } catch (parseError) {
      console.log(`⚠️  Warning: Could not parse k6 results: ${parseError.message}`);
    }
    
    return {
      target: targetName,
      url: targetUrl,
      timestamp: new Date().toISOString(),
      metricsFile: outputFile,
      summary: {
        totalRequests: metrics.length,
        type: 'k6'
      }
    };
  } catch (error) {
    console.error(`❌ k6 test failed for ${targetName}:`, error.message);
    return {
      target: targetName,
      url: targetUrl,
      error: error.message,
      type: 'k6'
    };
  }
}

async function runAllBenchmarks() {
  const runTimestamp = new Date().toISOString();
  const runId = runTimestamp.replace(/[:.]/g, '-').split('T')[0] + '_' + 
                runTimestamp.split('T')[1].split('.')[0].replace(/:/g, '-');
  const runDir = path.join(runsDir, runId);
  fs.mkdirSync(runDir, { recursive: true });

  const allResults = {
    runId: runId,
    timestamp: runTimestamp,
    targets: []
  };

  for (const targetName of selectedTargets) {
    if (!targets[targetName]) {
      console.error(`❌ Unknown target: ${targetName}`);
      continue;
    }

    const target = targets[targetName];
    console.log(`\n🎯 Benchmarking ${target.name} (${target.url})`);
    console.log('─'.repeat(50));

    // Run Playwright benchmark
    console.log(`\n🎭 Running Playwright tests for ${targetName}...`);
    const playwrightResults = await runPlaywrightBenchmark(targetName, target.url, runDir);
    console.log(`✅ Playwright tests completed for ${targetName}`);

    // Run k6 benchmark
    const k6Results = await runK6Benchmark(targetName, target.url, runDir);

    // Combine results
    const targetResults = {
      target: targetName,
      url: target.url,
      playwright: playwrightResults,
      k6: k6Results
    };

    allResults.targets.push(targetResults);

    // Save individual target results in run directory
    const targetResultFile = path.join(runDir, `${targetName}-combined-results.json`);
    fs.writeFileSync(targetResultFile, JSON.stringify(targetResults, null, 2));
    console.log(`💾 Results saved to ${targetResultFile}`);
  }

  // Save combined results in run directory
  const runResultFile = path.join(runDir, 'all-results.json');
  fs.writeFileSync(runResultFile, JSON.stringify(allResults, null, 2));
  console.log(`\n💾 Run results saved to ${runResultFile}`);

  // Also save as latest for easy access
  const latestResultFile = path.join(resultsDir, 'latest-results.json');
  fs.writeFileSync(latestResultFile, JSON.stringify(allResults, null, 2));
  console.log(`💾 Latest results saved to ${latestResultFile}`);

  // Update runs index
  updateRunsIndex(runId, runTimestamp, allResults);

  // Generate human-readable summary
  generateSummary(allResults, runDir);

  return allResults;
}

function updateRunsIndex(runId, timestamp, results) {
  const indexFile = path.join(resultsDir, 'runs-index.json');
  let runsIndex = [];
  
  if (fs.existsSync(indexFile)) {
    try {
      runsIndex = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    } catch (e) {
      runsIndex = [];
    }
  }
  
  runsIndex.push({
    runId: runId,
    timestamp: timestamp,
    targets: results.targets.map(t => t.target)
  });
  
  // Sort by timestamp, newest first
  runsIndex.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  // Keep only last 50 runs
  if (runsIndex.length > 50) {
    runsIndex = runsIndex.slice(0, 50);
  }
  
  fs.writeFileSync(indexFile, JSON.stringify(runsIndex, null, 2));
}

function generateSummary(results, runDir) {
  console.log('\n\n📋 BENCHMARK SUMMARY');
  console.log('═'.repeat(80));
  console.log(`Benchmark Run: ${results.timestamp}`);
  console.log(`Run ID: ${results.runId}\n`);

  const summaryLines = [];
  summaryLines.push('# Horserace Benchmark Summary');
  summaryLines.push('');
  summaryLines.push(`**Run ID:** ${results.runId}`);
  summaryLines.push(`**Run Date:** ${new Date(results.timestamp).toLocaleString()}`);
  summaryLines.push('');
  summaryLines.push('## Results by Target');
  summaryLines.push('');

  for (const targetResult of results.targets) {
    console.log(`\n🎯 Target: ${targetResult.target.toUpperCase()}`);
    console.log(`   URL: ${targetResult.url}`);
    
    summaryLines.push(`### ${targetResult.target.toUpperCase()}`);
    summaryLines.push(`**URL:** ${targetResult.url}`);
    summaryLines.push('');

    // Playwright results
    if (targetResult.playwright && !targetResult.playwright.error) {
      console.log('\n   🎭 Playwright Results:');
      summaryLines.push('#### Playwright Tests');
      summaryLines.push('');
      summaryLines.push('| Test | Status | Metrics |');
      summaryLines.push('|------|--------|---------|');

      for (const test of targetResult.playwright.tests) {
        const status = test.success ? '✅' : '❌';
        console.log(`      ${status} ${test.name}`);
        
        let metricsStr = '';
        if (test.duration) {
          console.log(`         Duration: ${test.duration}ms`);
          metricsStr = `${test.duration}ms`;
        }
        if (test.domContentLoaded) {
          console.log(`         DOM Content Loaded: ${test.domContentLoaded}ms`);
          console.log(`         DOM Interactive: ${test.domInteractive}ms`);
          metricsStr = `DCL: ${test.domContentLoaded}ms`;
        }
        if (test.ttfb !== undefined) {
          console.log(`         TTFB: ${test.ttfb}ms`);
          console.log(`         DNS: ${test.dns}ms`);
          console.log(`         TCP: ${test.tcp}ms`);
          metricsStr = `TTFB: ${test.ttfb}ms, DNS: ${test.dns}ms`;
        }
        
        summaryLines.push(`| ${test.name} | ${status} | ${metricsStr} |`);
      }
      summaryLines.push('');
    } else if (targetResult.playwright?.error) {
      console.log(`   ❌ Playwright Error: ${targetResult.playwright.error}`);
      summaryLines.push(`**Playwright Error:** ${targetResult.playwright.error}`);
      summaryLines.push('');
    }

    // k6 results
    if (targetResult.k6 && !targetResult.k6.error) {
      console.log('\n   📊 k6 Results:');
      console.log(`      ✅ Load test completed`);
      console.log(`      Results file: ${targetResult.k6.metricsFile}`);
      
      summaryLines.push('#### k6 Load Tests');
      summaryLines.push('');
      summaryLines.push('| Metric | Value |');
      summaryLines.push('|--------|-------|');
      summaryLines.push(`| Status | ✅ Completed |`);
      summaryLines.push(`| Results File | ${targetResult.k6.metricsFile} |`);
      summaryLines.push('');
    } else if (targetResult.k6?.error) {
      console.log(`   ⚠️  k6: ${targetResult.k6.error}`);
      summaryLines.push(`**k6 Status:** ${targetResult.k6.error}`);
      summaryLines.push('');
    } else if (!targetResult.k6) {
      console.log('   ⚠️  k6 tests skipped (k6 not installed)');
      summaryLines.push('**k6 Status:** Skipped (not installed)');
      summaryLines.push('');
    }

    console.log('');
  }

  // Save summary to run directory
  const summaryFile = path.join(runDir, 'SUMMARY.md');
  fs.writeFileSync(summaryFile, summaryLines.join('\n'));
  console.log(`\n📄 Summary saved to ${summaryFile}`);
  
  // Also save as latest summary
  const latestSummaryFile = path.join(resultsDir, 'SUMMARY.md');
  fs.writeFileSync(latestSummaryFile, summaryLines.join('\n'));
  console.log(`📄 Latest summary saved to ${latestSummaryFile}`);
  
  console.log('\n' + '═'.repeat(80));
  console.log('✨ Benchmark complete!\n');
}

// Run benchmarks
runAllBenchmarks().catch(error => {
  console.error('❌ Benchmark failed:', error);
  process.exit(1);
});
