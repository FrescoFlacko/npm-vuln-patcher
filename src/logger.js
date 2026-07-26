export function logProgress(options, message, output = console.log) {
  if (options.format === 'markdown') {
    output(`[npm-vuln-patcher] ${message}`);
  }
}
