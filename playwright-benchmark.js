const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function runPlaywrightBenchmark(targetName, targetUrl) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const metrics = {
    target: targetName,
    url: targetUrl,
    timestamp: new Date().toISOString(),
    tests: []
  };

  try {
    // Test 1: Page Load Performance
    const loadStart = Date.now();
    const response = await page.goto(targetUrl, { waitUntil: 'networkidle' });
    const loadEnd = Date.now();
    
    const pageLoadTime = loadEnd - loadStart;
    const statusCode = response.status();

    metrics.tests.push({
      name: 'page_load',
      success: statusCode === 200,
      statusCode: statusCode,
      duration: pageLoadTime,
      unit: 'ms'
    });

    // Test 2: DOM Content Loaded (using Navigation Timing API)
    const domMetrics = await page.evaluate(() => {
      const entries = performance.getEntriesByType('navigation');
      if (entries.length > 0) {
        const nav = entries[0];
        return {
          domContentLoaded: nav.domContentLoadedEventEnd - nav.fetchStart,
          domInteractive: nav.domInteractive - nav.fetchStart,
          loadComplete: nav.loadEventEnd - nav.fetchStart
        };
      }
      // Fallback if Navigation Timing Level 2 is not available
      return {
        domContentLoaded: 0,
        domInteractive: 0,
        loadComplete: 0
      };
    });

    metrics.tests.push({
      name: 'dom_metrics',
      success: true,
      domContentLoaded: domMetrics.domContentLoaded,
      domInteractive: domMetrics.domInteractive,
      loadComplete: domMetrics.loadComplete,
      unit: 'ms'
    });

    // Test 3: Get Performance Metrics
    const performanceMetrics = await page.evaluate(() => {
      const entries = performance.getEntriesByType('navigation');
      if (entries.length > 0) {
        const nav = entries[0];
        return {
          dns: nav.domainLookupEnd - nav.domainLookupStart,
          tcp: nav.connectEnd - nav.connectStart,
          ttfb: nav.responseStart - nav.requestStart,
          download: nav.responseEnd - nav.responseStart
        };
      }
      return null;
    });

    if (performanceMetrics) {
      metrics.tests.push({
        name: 'network_timing',
        success: true,
        dns: performanceMetrics.dns,
        tcp: performanceMetrics.tcp,
        ttfb: performanceMetrics.ttfb,
        download: performanceMetrics.download,
        unit: 'ms'
      });
    }

    // Test 4: Screenshot (for visual verification)
    const screenshotPath = path.join('results', `${targetName}-screenshot.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    metrics.screenshotPath = screenshotPath;

  } catch (error) {
    metrics.error = error.message;
    metrics.tests.push({
      name: 'error',
      success: false,
      error: error.message
    });
  } finally {
    await browser.close();
  }

  return metrics;
}

module.exports = { runPlaywrightBenchmark };
