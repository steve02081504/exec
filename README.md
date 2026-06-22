# @steve02081504/exec

A lightweight cross-platform utility for running shell commands. It wraps Node.js `child_process.spawn` with a consistent API for `sh`, `bash`, `PowerShell`, and `pwsh`.

## Used by

- [GentianAphrodite](https://github.com/steve02081504/GentianAphrodite)
- [fount](https://github.com/steve02081504/fount)

## Features

- **Multi-shell support**: Automatically detects and supports `sh`, `bash`, `powershell` (Windows PowerShell), and `pwsh` (PowerShell Core).
- **Cross-platform defaults**: Uses PowerShell on Windows and bash/sh on Linux and macOS.
- **Promise-based API**: All execution functions return a Promise and work with `async/await`.
- **Output handling**: Optionally strips ANSI terminal sequences (via [`ansi-regex`](https://github.com/chalk/ansi-regex)); returns stdout, stderr, and combined `stdall`.
- **Streaming callbacks**: `on_stdout`, `on_stderr`, `on_stdall`, and `on_close` let you process output as it arrives without waiting for the process to exit.
- **Skip output buffering**: `no_output_record` avoids accumulating stdout/stderr/stdall in memory; the Promise resolves with only `{ code, signal }` while callbacks still run.
- **Command discovery**: `where_command` resolves executables to full paths. On Windows, results follow `PATHEXT` and are suitable for direct `spawn` (e.g. `npx.cmd`, not bare `npx`).
- **execFile**: Run a binary with an argv array, without a shell (same role as Node’s `execFile`).

## Installation

```bash
npm install @steve02081504/exec
```

## Usage

```javascript
import { exec, execFile, powershell_exec, bash_exec } from '@steve02081504/exec';

// 1. Default shell (PowerShell on Windows, bash/sh on *nix)
const result = await exec('echo "Hello World"');
console.log(result.stdout); // "Hello World\n"

// 1b. Binary with argv (no shell)
const node = process.execPath;
const v = await execFile(node, ['-e', 'console.log("ok")']);
console.log(v.stdout);

// 2. PowerShell explicitly
const psResult = await powershell_exec('Get-Date');
console.log(psResult.stdout);

// 3. Bash explicitly
// May fail on Windows if WSL or Git Bash is not in PATH
try {
    const bashResult = await bash_exec('ls -la');
    console.log(bashResult.stdout);
} catch (e) {
    console.error("Bash usage failed:", e);
}

// 4. Full result object
const { code, signal, stdout, stderr, stdall } = await exec('ls_non_existent_file');
if (code !== 0) {
    console.error(`Command failed with code ${code}`);
    console.error(`Error output: ${stderr}`);
}
// signal is non-null when the child was terminated by a signal (e.g. SIGTERM)

// 5. Stream output as it arrives
let live = '';
await exec('npm install', {
    on_stdall: chunk => { live += chunk; process.stdout.write(chunk); },
    no_output_record: true, // avoid duplicating output in the resolved Promise
});
// live holds the full transcript; result is { code, signal } only
```

## API Reference

### `ExecResult`

By default, all execution functions resolve to:

```typescript
{
  code: number | null;           // exit code; null if the process did not exit normally
  signal: NodeJS.Signals | null; // set when the child was killed by a signal
  stdout: string;
  stderr: string;
  stdall: string;               // stdout + stderr, in arrival order; useful for agent reads
}
```

When `no_output_record: true`, the Promise resolves to `{ code, signal }` only. Stream callbacks (`on_stdout`, `on_stderr`, `on_stdall`) still receive each chunk as UTF-8 strings; `no_ansi_terminal_sequences` applies only to buffered output at resolve time, not to callback payloads.

### `exec(code, options?)`

Runs a command string in the platform default shell (PowerShell on Windows, bash/sh elsewhere).

- `code`: Command string to execute.
- `options`: Optional object forwarded to `child_process.spawn`, plus package-specific options (see [Options](#options-options)).
- Returns: `Promise<ExecResult>` (or `Promise<{ code, signal }>` when `no_output_record` is set)

### `execFile(file, args?, options?)`

Runs an executable **without** a shell, using an argv array (similar to Node.js `child_process.execFile`, but not the same signature).

- `file`: Path to the executable.
- `args`: Optional argument array; defaults to `[]`. To pass only `options`, use `execFile(file, [], options)` — unlike Node’s `execFile`, the second argument is **always** argv, not options.
- `options`: Optional object forwarded to `child_process.spawn` after default `windowsHide: true`, plus package-specific options (see [Options](#options-options)). Stdout and stderr are read as UTF-8.
- Returns: `Promise<ExecResult>` (or `Promise<{ code, signal }>` when `no_output_record` is set)

### `sh_exec(code, options?)`

Forces execution with `sh`.

- Returns: `Promise<ExecResult>`

### `bash_exec(code, options?)`

Forces execution with `bash`.

- Returns: `Promise<ExecResult>`

### `powershell_exec(code, options?)`

Forces execution with Windows PowerShell (`powershell.exe`).

- Returns: `Promise<ExecResult>`

### `pwsh_exec(code, options?)`

Forces execution with PowerShell Core (`pwsh`); falls back to `powershell.exe` when `pwsh` is unavailable.

- Returns: `Promise<ExecResult>`

### `where_command(command)`

Finds the full path of a command across platforms (similar to `which` or `where`).

- `command`: Command name to look up.
- Returns: `Promise<string>` — full path, or an empty string if not found.
- On Unix-like systems, uses `command -v`.
- On Windows, uses `where.exe` and picks the first result whose extension matches `PATHEXT` (or an existing `path + ext`), so the path can be passed directly to `execFile` or `spawn`.

### `removeTerminalSequences(str)`

Removes ANSI terminal sequences (CSI, OSC, cursor controls, etc.) from a string using `ansi-regex`.

- `str`: String to process.
- Returns: `string` — cleaned string.

### `available`

Indicates which shells are available on the current system.

- Type: `{ pwsh: boolean, powershell: boolean, bash: boolean, sh: boolean }`

### `shell_exec_map`

Maps shell names to their execution functions.

- Type: `Record<string, Function>`
- Keys: `'pwsh'`, `'powershell'`, `'bash'`, `'sh'`

### Options (`options`)

All execution functions accept an optional `options` object. Most fields are forwarded to `child_process.spawn`:

- `cwd`: Working directory for the child process.
- `env`: Environment variables for the child process.
- `stdio`, `uid`, `gid`, `detached`, and other [spawn options](https://nodejs.org/api/child_process.html#child_processspawncommand-args-options) are supported.

Package-specific options (not passed to `spawn`):

- `no_ansi_terminal_sequences`: (boolean) Strip ANSI sequences from buffered stdout, stderr, and stdall before resolve. Defaults to `false`. Does not modify data passed to stream callbacks.
- `no_output_record`: (boolean) Skip accumulating stdout/stderr/stdall. The Promise resolves with `{ code, signal }` only. Stream callbacks still run. Defaults to `false`.
- `on_stdout`: `(data: string) => void` — called for each stdout chunk (UTF-8).
- `on_stderr`: `(data: string) => void` — called for each stderr chunk (UTF-8).
- `on_stdall`: `(data: string) => void` — called for each stdout or stderr chunk, after `on_stdout` / `on_stderr`.
- `on_close`: `(code: number | null, signal: NodeJS.Signals | null) => void` — called when the child process exits.

Advanced shell overrides (rarely needed; each `*_exec` function sets these automatically):

- `shell`: Path to a specific shell executable.
- `args`: Extra arguments passed before the command switch.
- `cmdswitch`: Shell command switch (e.g. `-c` for sh/bash, `-Command` for PowerShell).

## Testing

```bash
npm test
```

Runs the built-in test suite with Node.js's native test runner (`node --test`).
