import { expect } from "@effect/vitest";
import { Effect, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

export const command = Effect.fnUntraced(function* (
  cwd: string,
  executable: string,
  args: readonly string[],
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const child = yield* spawner.spawn(
        ChildProcess.make(executable, args, { cwd, stdout: "pipe", stderr: "pipe" }),
      );
      const read = (stream: typeof child.stdout) =>
        stream.pipe(
          Stream.decodeText,
          Stream.runFold(
            () => "",
            (text, chunk) => text + chunk,
          ),
        );
      return yield* Effect.all(
        {
          exitCode: child.exitCode,
          stdout: read(child.stdout),
          stderr: read(child.stderr),
        },
        { concurrency: "unbounded" },
      );
    }),
  );
});

export const success = Effect.fnUntraced(function* (
  cwd: string,
  executable: string,
  args: readonly string[],
) {
  const result = yield* command(cwd, executable, args);
  expect(result.exitCode, result.stderr || result.stdout).toBe(0);
  return result.stdout;
});
