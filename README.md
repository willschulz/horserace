# 🏇 Horserace

A benchmarking harness for testing personal website performance across multiple targets using k6 and Playwright.

## Features

- **Dual Testing Approach**: Combines k6 load testing with Playwright browser-based testing
- **Multiple Targets**: Test against kylix, pyxis, and skyphos targets
- **Reproducible Results**: Generates JSON artifacts for data analysis
- **Human-Readable Reports**: Creates markdown summaries for easy review
- **Low Friction**: Simple one-command execution
- **No External Services Required**: Only needs the website to be accessible

## Prerequisites

### Required
- Node.js (v14 or higher)
- npm

### Optional
- [k6](https://k6.io/docs/getting-started/installation/) - For load testing (optional but recommended)

**Installing k6:**

```bash
# macOS
brew install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Windows
choco install k6
```

## Installation

1. Clone this repository:
```bash
git clone <repository-url>
cd horserace
```

2. Install dependencies:
```bash
npm install
```

## Configuration

Edit `targets.json` to configure your test targets. You can add multiple targets to test different servers or configurations:

```json
{
  "targets": {
    "willschulz": {
      "name": "willschulz",
      "url": "https://willschulz.com",
      "description": "Main website - willschulz.com"
    }
  }
}
```

To test different nodes of your homelab, you can add multiple targets with different URLs or modify the URL between runs.

## Usage

### Run benchmarks for all targets:
```bash
npm run benchmark
```

### Run benchmarks for specific targets:
```bash
npm run benchmark kylix pyxis
```

Or directly with node:
```bash
node run-benchmark.js kylix
```

## Output

The harness generates organized output files with support for multiple test runs:

### Results Organization
- Each test run is stored in `results/runs/{runId}/` with a unique timestamp-based ID
- `results/latest-results.json` - Always points to the most recent run
- `results/SUMMARY.md` - Summary of the latest run
- `results/runs-index.json` - Index of all test runs (last 50 runs)

### Per-Run Files (in `results/runs/{runId}/`)
- `all-results.json` - Combined results from all targets for this run
- `{target}-combined-results.json` - Individual target results
- `{target}-k6-results.json` - Raw k6 metrics (if k6 is installed)
- `{target}-screenshot.png` - Screenshot of each target homepage
- `SUMMARY.md` - Markdown summary for this specific run

### Comparing Multiple Runs

Use the comparison tool to compare performance across different test runs:

```bash
# List available runs
npm run compare

# Compare specific runs
npm run compare <runId1> <runId2> [runId3...]
```

Or directly:
```bash
node compare-runs.js <runId1> <runId2>
```

The comparison generates `results/COMPARISON.md` with side-by-side metrics showing:
- Performance differences between runs
- Best/worst performing metrics (highlighted)
- All Playwright metrics (page load, DOM timing, network timing)
- k6 test status for each run

## Test Types

### Playwright Tests
- **Page Load Performance**: Measures total page load time
- **DOM Metrics**: DOM Content Loaded, DOM Interactive, and Load Complete timings
- **Network Timing**: DNS, TCP, TTFB (Time to First Byte), and download times
- **Visual Verification**: Screenshots for manual inspection

### k6 Load Tests (Optional)
- **Load Profile**: Ramps up to 10 concurrent users over 30s, maintains for 1m, ramps down over 30s
- **HTTP Request Duration**: Tracks response times with p95 < 500ms threshold
- **Error Rate**: Monitors failed requests with < 10% threshold
- **Custom Metrics**: Page duration, success rate, and load counter

## Example Output

```
🏇 Horserace Benchmarking Harness
==================================

🎯 Benchmarking kylix (http://kylix.local)
──────────────────────────────────────────────────

🎭 Running Playwright tests for kylix...
✅ Playwright tests completed for kylix

📊 Running k6 load test for kylix...
✅ k6 test completed for kylix

💾 Results saved to results/kylix-combined-results.json

📋 BENCHMARK SUMMARY
════════════════════════════════════════════════════════════════════════════════
Benchmark Run: 2026-01-18T22:30:00.000Z

🎯 Target: KYLIX
   URL: http://kylix.local

   🎭 Playwright Results:
      ✅ page_load
         Duration: 245ms
      ✅ dom_metrics
         DOM Content Loaded: 180ms
         DOM Interactive: 150ms
      ✅ network_timing
         TTFB: 45ms
         DNS: 2ms
         TCP: 5ms

   📊 k6 Results:
      ✅ Load test completed
      Results file: results/kylix-k6-results.json
```

## Architecture

The harness consists of four main components:

1. **run-benchmark.js**: Main orchestrator that runs tests for all configured targets and manages run history
2. **playwright-benchmark.js**: Browser-based testing module using Playwright
3. **k6-load-test.js**: Load testing script using k6
4. **compare-runs.js**: Comparison tool for analyzing differences between multiple test runs

Results are collected, combined, and formatted into both JSON (for automation) and Markdown (for human review). Each run is timestamped and stored separately, enabling easy comparison of performance over time or across different server configurations.

## License

MIT