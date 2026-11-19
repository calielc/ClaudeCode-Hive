import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { eventually, type Hive, launchHive } from "./app";

/** A local stand-in for the releases API of GitHub. `latest` is the tag that it reports. */
function releaseServer(
  latest: string,
): Promise<{ server: Server; url: string }> {
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        tag_name: latest,
        html_url: `http://127.0.0.1/releases/tag/${latest}`,
        draft: false,
        prerelease: false,
      }),
    );
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${port}/latest` });
    });
  });
}

describe("the notice of a newer release", () => {
  let hive: Hive;
  let server: Server;
  let folder: string;

  before(async () => {
    folder = mkdtempSync(join(tmpdir(), "hive-update-"));
    const release = await releaseServer("v99.0.0");
    server = release.server;
    hive = await launchHive({
      env: {
        HIVE_UPDATE_URL: release.url,
        HIVE_UPDATE_CURRENT_VERSION: "2.0.0",
        HIVE_UPDATE_DELAY_MS: "100",
        HIVE_UPDATE_RETRY_MS: "300",
        HIVE_UPDATE_LOG: join(folder, "update.log"),
        HIVE_OPEN_LOG: join(folder, "opened.log"),
      },
    });
  });
  after(async () => {
    await hive.close();
    server.close();
    // The log of the check helps to find a fault on a runner that I cannot see.
    try {
      console.log(readFileSync(join(folder, "update.log"), "utf8"));
    } catch {
      console.log("The check wrote no log.");
    }
    rmSync(folder, { recursive: true, force: true });
  });

  test("shows the new version, and a click opens its page", async () => {
    const notice = hive.page.locator(".update-notice");
    await notice.waitFor();
    assert.match((await notice.textContent()) ?? "", /Update 99\.0\.0/);
    assert.equal((await hive.state()).update?.version, "99.0.0");

    await hive.page.locator(".update-link").click();
    await eventually(() =>
      assert.match(
        readFileSync(join(folder, "opened.log"), "utf8"),
        /releases\/tag\/v99\.0\.0/,
      ),
    );
  });

  test("the cross hides the notice for that version", async () => {
    await hive.page.locator(".update-dismiss").click();
    await eventually(async () =>
      assert.equal(await hive.page.locator(".update-notice").count(), 0),
    );
    assert.equal((await hive.state()).dismissedUpdate, "99.0.0");
  });
});

describe("no notice", () => {
  test("when the latest release is not newer than the app", async () => {
    const release = await releaseServer("v2.0.0");
    const folder = mkdtempSync(join(tmpdir(), "hive-update-"));
    const logFile = join(folder, "update.log");
    const hive = await launchHive({
      env: {
        HIVE_UPDATE_URL: release.url,
        HIVE_UPDATE_CURRENT_VERSION: "2.0.0",
        HIVE_UPDATE_DELAY_MS: "100",
        HIVE_UPDATE_LOG: logFile,
      },
    });
    try {
      // Wait until the check has run. Then a newer release would have shown, so no notice means that it is not newer.
      await eventually(() =>
        assert.match(readFileSync(logFile, "utf8"), /latest release is 2.0.0/),
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.equal(await hive.page.locator(".update-notice").count(), 0);
      assert.equal((await hive.state()).update, null);
    } finally {
      await hive.close();
      release.server.close();
      rmSync(folder, { recursive: true, force: true });
    }
  });

  test("when the app is not installed and no address is set", async () => {
    const hive = await launchHive();
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      assert.equal(await hive.page.locator(".update-notice").count(), 0);
    } finally {
      await hive.close();
    }
  });
});
