// A stand-in for the `claude` command in the e2e tests. It prints a marker and echoes every input, so a test can see what the terminal sends.
console.log('HIVE-E2E-READY')
process.stdin.on('data', (chunk) => {
  process.stdout.write('echo:' + JSON.stringify(String(chunk)) + '\n')
})
setInterval(() => undefined, 1000000)
