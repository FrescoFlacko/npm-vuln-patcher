#!/usr/bin/env node

import { runNpmVulnPatcherCli } from '../src/index.js';

runNpmVulnPatcherCli(process.argv.slice(2))
  .then((report) => {
    process.exitCode = report.exitCode;
  })
  .catch((error) => {
    if (!error.reportPrinted) {
      console.error(`[npm-vuln-patcher] ${error.message}`);
    }
    process.exitCode = error.exitCode || 1;
  });
