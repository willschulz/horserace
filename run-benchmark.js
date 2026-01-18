const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { runPlaywrightBenchmark } = require('./playwright-benchmark.js');

// Create results directory if it doesn't exist
const resultsDir = path.join(__dirname, 'results');
if (!fs.existsSync(resultsDir)) {
  fs.mkdirSync(resultsDir);
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

async function runK6Benchmark(targetName, targetUrl) {
  console.log(`\n📊 Running k6 load test for ${targetName}...`);
  
  const outputFile = path.join(resultsDir, `${targetName}-k6-results.json`);
  
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
    const rawResults = fs.readFileSync(outputFile, 'utf8');
    const lines = rawResults.trim().split('\n');
    const metrics = lines.map(line => JSON.parse(line)).filter(m => m.type === 'Point');
    
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
  const allResults = {
    timestamp: new Date().toISOString(),
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
    const playwrightResults = await runPlaywrightBenchmark(targetName, target.url);
    console.log(`✅ Playwright tests completed for ${targetName}`);

    // Run k6 benchmark
    const k6Results = await runK6Benchmark(targetName, target.url);

    // Combine results
    const targetResults = {
      target: targetName,
      url: target.url,
      playwright: playwrightResults,
      k6: k6Results
    };

    allResults.targets.push(targetResults);

    // Save individual target results
    const targetResultFile = path.join(resultsDir, `${targetName}-combined-results.json`);
    fs.writeFileSync(targetResultFile, JSON.stringify(targetResults, null, 2));
    console.log(`💾 Results saved to ${targetResultFile}`);
  }

  // Save combined results
  const combinedResultFile = path.join(resultsDir, 'all-results.json');
  fs.writeFileSync(combinedResultFile, JSON.stringify(allResults, null, 2));
  console.log(`\n💾 Combined results saved to ${combinedResultFile}`);

  // Generate human-readable summary
  generateSummary(allResults);

  return allResults;
}

function generateSummary(results) {
  console.log('\n\n📋 BENCHMARK SUMMARY');
  console.log('═'.repeat(80));
  console.log(`Benchmark Run: ${results.timestamp}\n`);

  const summaryLines = [];
  summaryLines.push('# Horserace Benchmark Summary');
  summaryLines.push('');
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

  // Save summary to file
  const summaryFile = path.join(resultsDir, 'SUMMARY.md');
  fs.writeFileSync(summaryFile, summaryLines.join('\n'));
  console.log(`\n📄 Human-readable summary saved to ${summaryFile}`);
  
  console.log('\n' + '═'.repeat(80));
  console.log('✨ Benchmark complete!\n');
}

// Run benchmarks
runAllBenchmarks().catch(error => {
  console.error('❌ Benchmark failed:', error);
  process.exit(1);
});
