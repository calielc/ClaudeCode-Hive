// A stand-in for the `claude` command in the e2e tests. It prints a marker and echoes every input, so a test can see what the terminal sends.
console.log("HIVE-E2E-READY");
process.stdin.on("data", (chunk) => {
  process.stdout.write(`echo:${JSON.stringify(String(chunk))}\n`);
});
// A size change of the terminal shows as a line, so a test can see the size that the process has.
process.stdout.on("resize", () =>
  console.log(`size:${process.stdout.columns}x${process.stdout.rows}`),
);
setInterval(() => undefined, 1000000);
