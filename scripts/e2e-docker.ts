/**
 * Runs the end-to-end tests inside a Docker container, on a virtual screen (the same setup as the Linux CI job).
 * No window opens on your desktop, so the tests do not take the focus from your work.
 *
 *   npm run test:e2e:docker
 *
 * The first run builds the image, which takes a few minutes. Later runs reuse it and the npm cache volume.
 * Node 22.18 or later runs this file directly.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const IMAGE = "hive-e2e";
const root = resolve(import.meta.dirname, "..");

function docker(args: string[]): number {
  const result = spawnSync("docker", args, { stdio: "inherit" });
  if (result.error) {
    console.error(
      "Docker is not available. Install Docker and start it, then try again.",
    );
    return 127;
  }
  return result.status ?? 1;
}

const built = docker(["build", "--quiet", "-t", IMAGE, "e2e/docker"]);
if (built !== 0) {
  process.exit(built);
}
process.exit(
  docker([
    "run",
    "--rm",
    "-v",
    `${root}:/src:ro`,
    "-v",
    "hive-e2e-npm:/root/.npm",
    IMAGE,
    "bash",
    "/src/e2e/docker/run.sh",
  ]),
);
