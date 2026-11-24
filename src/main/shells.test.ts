import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";
import { projectDirectory } from "./paths.ts";
import { listShells, readShellOutput } from "./shells.ts";

const SESSION = "22222222-2222-4222-8222-222222222222";
const OTHER_SESSION = "33333333-3333-4333-8333-333333333333";
const MINUTE = 60 * 1000;
const KIB_512 = 524288;
const line = (value: object): string => `${JSON.stringify(value)}\n`;

interface Context {
  folder: string;
  transcript: string;
  tasksRoot: string;
}

function setup(): Context {
  const root = mkdtempSync(join(tmpdir(), "hive-shells-"));
  process.env.CLAUDE_CONFIG_DIR = join(root, "claude");
  const folder = join(root, "work");
  const directory = projectDirectory(folder);
  mkdirSync(directory, { recursive: true });
  return {
    folder,
    transcript: join(directory, `${SESSION}.jsonl`),
    tasksRoot: join(root, "tmp", "claude-501", basename(directory)),
  };
}

function outputPath(context: Context, session: string, id: string): string {
  return join(context.tasksRoot, session, "tasks", `${id}.output`);
}

function status(
  id: string,
  fields: {
    description?: string;
    command?: string;
    taskType?: string;
    outputFilePath?: string;
    timestamp?: string;
  } = {},
): string {
  return line({
    type: "attachment",
    timestamp: fields.timestamp ?? "2026-11-24T10:00:00.000Z",
    attachment: {
      type: "task_status",
      taskId: id,
      taskType: fields.taskType ?? "local_bash",
      description: fields.description,
      status: "running",
      outputFilePath: fields.outputFilePath ?? `/private/tmp/x/${id}.output`,
      shell:
        fields.command === undefined
          ? undefined
          : { command: fields.command, kind: "bash", toolUseId: "toolu_1" },
    },
  });
}

function ended(id: string, state: string, timestamp?: string): string {
  return line({
    type: "user",
    timestamp,
    message: {
      role: "user",
      content: `<task-notification>\n<task-id>${id}</task-id>\n<tool-use-id>toolu_9</tool-use-id>\n<output-file>/tmp/x</output-file>\n<status>${state}</status>\n<summary>Background command done</summary>\n</task-notification>`,
    },
  });
}

function age(file: string, milliseconds: number): void {
  const old = new Date(Date.now() - milliseconds);
  utimesSync(file, old, old);
}

test("one row per local_bash task id, in order of first appearance, with the first description and command", async () => {
  // Arrange
  const context = setup();
  writeFileSync(
    context.transcript,
    status("zz9", { description: "Serve docs", command: "npm run docs" }) +
      status("aa1", { description: "Watch tests", command: "npm test -w" }) +
      status("zz9", { description: "Serve docs again", command: "npm run x" }),
  );

  // Act
  const shells = await listShells(context.folder, SESSION);

  // Assert
  assert.deepEqual(
    shells.map((shell) => [
      shell.id,
      shell.description,
      shell.command,
      shell.running,
    ]),
    [
      ["zz9", "Serve docs", "npm run docs", true],
      ["aa1", "Watch tests", "npm test -w", true],
    ],
  );
});

test("updated is the epoch of the last line of that task", async () => {
  // Arrange
  const context = setup();
  writeFileSync(
    context.transcript,
    status("t1", { timestamp: "2026-11-24T08:15:30.000Z" }) +
      status("t2", { timestamp: "2026-11-24T08:16:00.000Z" }) +
      status("t1", { timestamp: "2026-11-24T08:17:45.500Z" }),
  );

  // Act
  const shells = await listShells(context.folder, SESSION);

  // Assert
  assert.equal(shells.find((s) => s.id === "t1")?.updated, 1795508265500);
  assert.equal(shells.find((s) => s.id === "t2")?.updated, 1795508160000);
});

test("updated counts the end notification when it is the last line of the task", async () => {
  // Arrange
  const context = setup();
  writeFileSync(
    context.transcript,
    status("n1", { timestamp: "2026-11-24T09:00:00.000Z" }) +
      status("n2", { timestamp: "2026-11-24T09:05:00.000Z" }) +
      ended("n1", "completed", "2026-11-24T09:12:21.250Z"),
  );

  // Act
  const shells = await listShells(context.folder, SESSION);

  // Assert
  assert.equal(shells.find((s) => s.id === "n1")?.updated, 1795511541250);
  assert.equal(shells.find((s) => s.id === "n1")?.running, false);
  assert.equal(shells.find((s) => s.id === "n2")?.updated, 1795511100000);
});

test("a task without a shell object has an empty command and takes the description as label", async () => {
  // Arrange
  const context = setup();
  writeFileSync(
    context.transcript,
    status("d1", { description: "Dev server" }) + status("d2"),
  );

  // Act
  const shells = await listShells(context.folder, SESSION);

  // Assert
  assert.deepEqual(
    shells.map((shell) => [shell.id, shell.command, shell.description]),
    [
      ["d1", "", "Dev server"],
      ["d2", "", "Shell"],
    ],
  );
});

test("the description falls back to the command, then to Shell", async () => {
  // Arrange
  const context = setup();
  writeFileSync(
    context.transcript,
    status("m1", { command: "make build" }) +
      status("m2", { description: "", command: "go run ./cmd" }) +
      status("m3", {}) +
      status("m4", { description: "", command: "" }),
  );

  // Act
  const shells = await listShells(context.folder, SESSION);

  // Assert
  assert.deepEqual(
    shells.map((shell) => shell.description),
    ["make build", "go run ./cmd", "Shell", "Shell"],
  );
});

test("a shell runs until a notification with a final status names its id", async () => {
  // Arrange
  const context = setup();
  writeFileSync(
    context.transcript,
    status("c1") +
      status("f2") +
      status("k3") +
      status("r4") +
      status("o5") +
      status("s6") +
      status("w7") +
      ended("c1", "completed") +
      ended("f2", "failed") +
      ended("k3", "killed") +
      ended("s6", "stopped") +
      ended("w7", "weird") +
      ended("zzz", "completed") +
      line({ type: "queue-operation", operation: "enqueue", content: "x" }) +
      line({
        type: "queue-operation",
        operation: "enqueue",
        content:
          "<task-notification><task-id>o5</task-id><status>completed</status></task-notification>",
      }),
  );

  // Act
  const shells = await listShells(context.folder, SESSION);

  // Assert
  assert.deepEqual(
    shells.map((shell) => [shell.id, shell.running]),
    [
      ["c1", false],
      ["f2", false],
      ["k3", false],
      ["r4", true],
      ["o5", true],
      ["s6", false],
      ["w7", false],
    ],
  );
});

test("a quiet transcript ends a shell after exactly 15 minutes", async () => {
  // Arrange
  const context = setup();
  writeFileSync(context.transcript, status("q1"));
  age(context.transcript, 15 * MINUTE - 10 * 1000);

  // Act
  const justUnder = await listShells(context.folder, SESSION);
  age(context.transcript, 15 * MINUTE + 10 * 1000);
  const justOver = await listShells(context.folder, SESSION);

  // Assert
  assert.equal(justUnder[0]?.running, true);
  assert.equal(justOver[0]?.running, false);
  assert.equal(justOver.length, 1);
});

test("a task type other than local_bash is not a shell", async () => {
  // Arrange
  const context = setup();
  writeFileSync(
    context.transcript,
    status("ag1", { taskType: "local_agent", description: "Sub agent" }) +
      status("sh1", { description: "Real shell" }) +
      status("rw1", { taskType: "remote_workflow" }),
  );

  // Act
  const shells = await listShells(context.folder, SESSION);

  // Assert
  assert.deepEqual(
    shells.map((shell) => shell.id),
    ["sh1"],
  );
});

test("a task id that is not a safe id gives no row, and an unsafe session id gives an empty list", async () => {
  // Arrange
  const context = setup();
  writeFileSync(
    context.transcript,
    status("../x") + status("a b") + status("ok-7"),
  );

  // Act
  const shells = await listShells(context.folder, SESSION);
  const unsafeSession = await listShells(context.folder, "../etc");

  // Assert
  assert.deepEqual(
    shells.map((shell) => shell.id),
    ["ok-7"],
  );
  assert.deepEqual(unsafeSession, []);
});

test("a missing transcript gives an empty list, and a malformed line is skipped", async () => {
  // Arrange
  const context = setup();
  const missing = await listShells(context.folder, OTHER_SESSION);
  writeFileSync(
    context.transcript,
    `${status("p1", { description: "Before" })}{not json\n\n${status("p2", { description: "After" })}`,
  );

  // Act
  const shells = await listShells(context.folder, SESSION);

  // Assert
  assert.deepEqual(missing, []);
  assert.deepEqual(
    shells.map((shell) => shell.description),
    ["Before", "After"],
  );
});

function withOutput(
  context: Context,
  id: string,
  content: string,
  recorded?: string,
): string {
  const file = outputPath(context, SESSION, id);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, content);
  writeFileSync(
    context.transcript,
    status(id, { outputFilePath: recorded ?? file }),
  );
  return file;
}

test("the output of a shell is read when the last four segments match", async () => {
  // Arrange
  const context = setup();
  withOutput(context, "bg7x", "server ready on 5173\nhit /api\n");

  // Act
  const output = await readShellOutput(context.folder, SESSION, "bg7x");

  // Assert
  assert.equal(output, "server ready on 5173\nhit /api\n");
});

test("the output is refused when the recorded path points elsewhere", async () => {
  // Arrange
  const context = setup();
  const elsewhere = withOutput(context, "e1", "secret", "/etc/passwd");
  const otherSession = outputPath(context, OTHER_SESSION, "e2");
  mkdirSync(join(otherSession, ".."), { recursive: true });
  writeFileSync(otherSession, "other session text");
  writeFileSync(
    context.transcript,
    status("e1", { outputFilePath: "/etc/passwd" }) +
      status("e2", { outputFilePath: otherSession }) +
      status("e3", {
        outputFilePath: join(context.tasksRoot, SESSION, "tasks", "e9.output"),
      }),
  );

  // Act
  const passwd = await readShellOutput(context.folder, SESSION, "e1");
  const wrongSession = await readShellOutput(context.folder, SESSION, "e2");
  const wrongName = await readShellOutput(context.folder, SESSION, "e3");

  // Assert
  assert.ok(elsewhere.endsWith("e1.output"));
  assert.equal(passwd, "");
  assert.equal(wrongSession, "");
  assert.equal(wrongName, "");
});

test("the output is refused when the file is a symlink", async () => {
  // Arrange
  const context = setup();
  const target = join(context.tasksRoot, "real.txt");
  mkdirSync(context.tasksRoot, { recursive: true });
  writeFileSync(target, "linked text");
  const link = outputPath(context, SESSION, "ln1");
  mkdirSync(join(link, ".."), { recursive: true });
  symlinkSync(target, link);
  writeFileSync(context.transcript, status("ln1", { outputFilePath: link }));

  // Act
  const output = await readShellOutput(context.folder, SESSION, "ln1");

  // Assert
  assert.equal(output, "");
});

test("the output is empty for an invalid shell id, an unsafe session id and a missing file", async () => {
  // Arrange
  const context = setup();
  withOutput(context, "ok1", "fine");
  const gone = outputPath(context, SESSION, "gone1");
  writeFileSync(
    context.transcript,
    status("ok1", { outputFilePath: outputPath(context, SESSION, "ok1") }) +
      status("gone1", { outputFilePath: gone }) +
      status("../x", { outputFilePath: outputPath(context, SESSION, "../x") }),
  );

  // Act
  const invalid = await readShellOutput(context.folder, SESSION, "../x");
  const unsafeSession = await readShellOutput(context.folder, "../a", "ok1");
  const missingFile = await readShellOutput(context.folder, SESSION, "gone1");
  const unknownId = await readShellOutput(context.folder, SESSION, "nope9");

  // Assert
  assert.equal(invalid, "");
  assert.equal(unsafeSession, "");
  assert.equal(missingFile, "");
  assert.equal(unknownId, "");
});

test("the output is empty when the task has no outputFilePath", async () => {
  // Arrange
  const context = setup();
  writeFileSync(
    context.transcript,
    line({
      type: "attachment",
      timestamp: "2026-11-24T10:00:00.000Z",
      attachment: {
        type: "task_status",
        taskId: "np1",
        taskType: "local_bash",
      },
    }),
  );

  // Act
  const output = await readShellOutput(context.folder, SESSION, "np1");

  // Assert
  assert.equal(output, "");
});

test("a file of exactly 512 KiB is returned whole", async () => {
  // Arrange
  const context = setup();
  const content = `ZY\n${"k".repeat(KIB_512 - 4)}\n`;
  withOutput(context, "big1", content);

  // Act
  const output = await readShellOutput(context.folder, SESSION, "big1");

  // Assert
  assert.equal(Buffer.byteLength(content), KIB_512);
  assert.equal(output, content);
});

test("a file one byte over 512 KiB loses its partial first line", async () => {
  // Arrange
  const context = setup();
  const rest = `${"k".repeat(KIB_512 - 3)}\n`;
  const content = `ZY\n${rest}`;
  withOutput(context, "big2", content);

  // Act
  const output = await readShellOutput(context.folder, SESSION, "big2");

  // Assert
  assert.equal(Buffer.byteLength(content), KIB_512 + 1);
  assert.equal(output, rest);
});

test("a much larger file returns only whole lines from its last 512 KiB", async () => {
  // Arrange
  const context = setup();
  const filler = `${"f".repeat(1023)}\n`;
  const tail = `${"t".repeat(1023)}\n`;
  withOutput(
    context,
    "big3",
    `start\n${filler.repeat(1500)}${tail.repeat(300)}final line\n`,
  );

  // Act
  const output = await readShellOutput(context.folder, SESSION, "big3");

  // Assert
  assert.ok(output.endsWith(`${tail}final line\n`));
  assert.ok(output.startsWith("f") || output.startsWith("t"));
  assert.ok(Buffer.byteLength(output) <= KIB_512);
  assert.ok(Buffer.byteLength(output) > KIB_512 - 1100);
  assert.ok(!output.includes("start"));
  assert.equal(
    output.length % 1024 === 0 || output.endsWith("final line\n"),
    true,
  );
});
