import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';

const execFileAsync = promisify(execFile);

// ── Public types ──────────────────────────────────────────────────────────────

export type SupportedLanguage = 'javascript' | 'cpp';

export interface ExecuteOptions {
  language: SupportedLanguage;
  code: string;
}

export interface ExecuteResult {
  success: boolean;
  output: string;
  error?: string;
}

// ── Language descriptors ──────────────────────────────────────────────────────

interface LanguageDescriptor {
  /** File extension used when writing the temp source file. */
  extension: string;
  /**
   * Shell command run *inside* the container.
   * `/code/src` is where the source file is bind-mounted.
   * `/tmp` is the only writable directory (--read-only + --tmpfs /tmp).
   */
  containerCmd: (filename: string) => string;
}

const LANGUAGE_MAP: Record<SupportedLanguage, LanguageDescriptor> = {
  javascript: {
    extension: 'js',
    containerCmd: (filename) => `node /code/${filename}`,
  },
  cpp: {
    extension: 'cpp',
    // Compile to /tmp (the only writable FS path inside the container), then run.
    // A non-zero compiler exit code surfaces on stderr and we treat it as an error.
    containerCmd: (filename) =>
      `g++ /code/${filename} -o /tmp/a.out -std=c++17 && /tmp/a.out`,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns a promise that rejects after `ms` milliseconds with a TimeoutError.
 * Used in Promise.race to bound Docker execution time.
 */
function timeoutAfter(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new TimeoutError(`Execution timed out after ${ms}ms`)), ms),
  );
}

class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Build the `docker run` argv array.
 *
 * Security flags applied:
 *   --rm             auto-remove the container on exit
 *   --network none   no outbound connectivity
 *   --memory 128m    hard RSS cap — OOM-killed if exceeded
 *   --cpus 0.5       half a core to prevent CPU starvation of the host
 *   --pids-limit 64  blocks fork bombs
 *   --read-only      immutable container FS (except explicit tmpfs mounts)
 *   --tmpfs /tmp     writable scratch space for compiled binaries
 *   --user nobody    drops root inside the container
 *   -v ... :ro       source file is bind-mounted read-only
 */
function buildDockerArgv(
  hostFilePath: string,
  containerId: string,
  descriptor: LanguageDescriptor,
  filename: string,
): string[] {
  return [
    'run',
    '--rm',
    '--name', containerId,
    '--network', 'none',
    '--memory', '128m',
    '--cpus', '0.5',
    '--pids-limit', '64',
    '--read-only',
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
    '--user', 'nobody',
    '-v', `${hostFilePath}:/code/${filename}:ro`,
    env.sandbox.image,
    'sh', '-c', descriptor.containerCmd(filename),
  ];
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function executeCode(options: ExecuteOptions): Promise<ExecuteResult> {
  const { language, code } = options;

  const descriptor = LANGUAGE_MAP[language];
  const filename = `main.${descriptor.extension}`;
  const hostFilePath = join(tmpdir(), `codepulse-${randomUUID()}-${filename}`);

  // Unique container name lets us kill it by name on timeout.
  const containerId = `codepulse-run-${randomUUID()}`;

  // Write the user's code to a temp file on the host filesystem.
  await writeFile(hostFilePath, code, { encoding: 'utf8', mode: 0o600 });

  try {
    const argv = buildDockerArgv(hostFilePath, containerId, descriptor, filename);

    const executionPromise = execFileAsync('docker', argv, {
      // execFile maxBuffer defaults to 200KB; raise to 1MB to capture verbose output.
      maxBuffer: 1024 * 1024,
      // Do NOT pass `shell: true` — execFile without it never invokes a shell,
      // so argv values cannot escape into shell metacharacter injection.
    });

    // Race execution against the wall-clock timeout.
    const { stdout, stderr } = await Promise.race([
      executionPromise,
      timeoutAfter(env.sandbox.timeoutMs),
    ]);

    const output = stdout.trim();
    const errorOutput = stderr.trim();

    if (errorOutput) {
      // stderr present but exit code 0 — treat as warning output (e.g. g++ -Wall notices)
      return { success: true, output, error: errorOutput };
    }

    return { success: true, output };
  } catch (err: unknown) {
    if (err instanceof TimeoutError) {
      // Best-effort container kill — ignore errors (container may have already exited)
      void execFileAsync('docker', ['kill', containerId]).catch(() => undefined);
      return { success: false, output: '', error: err.message };
    }

    // execFile rejects with an object that has stdout/stderr when the process
    // exits with a non-zero code (e.g. compiler error, runtime exception).
    const execErr = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string };

    const output = (execErr.stdout ?? '').trim();
    // Compiler errors and uncaught exceptions land in stderr.
    const errorOutput = (execErr.stderr ?? execErr.message ?? 'Unknown error').trim();

    return { success: false, output, error: errorOutput };
  } finally {
    // Always clean up the temp file, even if Docker failed to start.
    await unlink(hostFilePath).catch(() => undefined);
  }
}
