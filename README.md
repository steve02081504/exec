# @steve02081504/exec

A lightweight cross-platform utility for running shell commands. It wraps Node.js `child_process.spawn` with a consistent API for `sh`, `bash`, `PowerShell`, and `pwsh`.

## Used by

- [GentianAphrodite](https://github.com/steve02081504/GentianAphrodite)
- [fount](https://github.com/steve02081504/fount)

## Features

- **Multi-shell support**: Automatically detects and supports `sh`, `bash`, `powershell` (Windows PowerShell), and `pwsh` (PowerShell Core).
- **Async shell detection**: Shell paths are probed in the background at import time (including lazy `where_command` lookups), so module load stays fast. Each `*_exec` waits for its shell probe before running.
- **Cross-platform defaults**: Uses PowerShell on Windows and bash/sh on Linux and macOS.
- **Promise-based API**: All execution functions return a Promise and work with `async/await`.
- **Output handling**: Optionally strips ANSI terminal sequences (via [`ansi-regex`](https://github.com/chalk/ansi-regex)); returns stdout, stderr, and combined `stdall`.
- **Streaming callbacks**: `on_spawn`, `on_stdout`, `on_stderr`, `on_stdall`, and `on_close` let you process output as it arrives or hook the child immediately after spawn.
- **Skip output buffering**: `no_output_record` avoids accumulating stdout/stderr/stdall in memory; the Promise resolves with only `{ code, signal }` while callbacks still run.
- **Command discovery**: `where_command` resolves executables to full paths. On Windows, results follow `PATHEXT` and are suitable for direct `spawn` (e.g. `npx.cmd`, not bare `npx`).
- **execFile**: Run a binary with an argv array, without a shell (same role as Node’s `execFile`).

## Installation

```bash
npm install @steve02081504/exec
```

## Usage

```javascript
import { available, exec, execFile, powershell_exec, bash_exec, shell_exec_map } from '@steve02081504/exec';

// 1. Default shell (PowerShell on Windows, bash/sh on *nix)
const result = await exec('echo "Hello World"');
console.log(result.stdout); // "Hello World\n"

// 1a. Shell availability (probed asynchronously at import)
if (await available.pwsh) // for now `available.*` is Promise<boolean> or boolean
    console.log('pwsh is available');
const shells = await available;
console.log(shells); // e.g. { sh: true, bash: true, pwsh: true, powershell: true }
if (available.bash) { // after `await available`, all available.* will been boolean
    await shell_exec_map.bash('echo hi').then(result => {
		console.log(result.stdout);
	});
}

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
  stdall: string;               // stdout + stderr in arrival order; useful for agent reads
}
```

When `no_output_record: true`, the Promise resolves to `{ code, signal }` only. Stream callbacks (`on_stdout`, `on_stderr`, `on_stdall`) still receive each chunk as UTF-8 strings; `no_ansi_terminal_sequences` applies only to buffered output at resolve time, not to callback payloads.

### `ExecResultWithoutOutput`

When `no_output_record: true`, execution functions resolve to:

```typescript
{
  code: number | null;
  signal: NodeJS.Signals | null;
}
```

Stream callbacks still receive raw chunks; only the Promise payload omits buffered output fields.

### `exec(code, options?)`

Runs a command string in the platform default shell (PowerShell on Windows, bash/sh elsewhere).

- `code`: Command string to execute.
- `options`: Optional object forwarded to `child_process.spawn`, plus package-specific options (see [Options](#options-options)).
- Returns: `Promise<ExecResult>` (or `Promise<{ code, signal }>` when `no_output_record` is set)
- Throws: `Error('No shell available')` on non-Windows systems when neither bash nor sh is available.

### `execFile(file, args?, options?)`

Runs an executable **without** a shell, using an argv array (similar to Node.js `child_process.execFile`, but not the same signature).

- `file`: Path to the executable.
- `args`: Optional argument array; defaults to `[]`. To pass only `options`, use `execFile(file, [], options)` — unlike Node’s `execFile`, the second argument is **always** argv, not options.
- `options`: Optional object forwarded to `child_process.spawn` after default `windowsHide: true`, plus package-specific options (see [Options](#options-options)). Stdout and stderr are read as UTF-8.
- Returns: `Promise<ExecResult>` (or `Promise<{ code, signal }>` when `no_output_record` is set)

### `sh_exec(code, options?)`

Forces execution with `sh`. Waits for shell path detection (`available.sh`) before running.

- Returns: `Promise<ExecResult>`

### `bash_exec(code, options?)`

Forces execution with `bash`. Waits for shell path detection (`available.bash`) before running.

- Returns: `Promise<ExecResult>`

### `powershell_exec(code, options?)`

Forces execution with Windows PowerShell (`powershell.exe`). Waits for shell path detection (`available.powershell`) before running.

- Returns: `Promise<ExecResult>`

### `pwsh_exec(code, options?)`

Forces execution with PowerShell Core (`pwsh`); falls back to `powershell.exe` when `pwsh` is unavailable. Waits for `available.pwsh` (or `available.powershell`) before running.

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

Indicates which shells are available on the current system. Probing starts when the module is imported and runs in the background; `where_command` candidates are resolved lazily when needed.

The first `await available` after import may take about **2–3 seconds**, depending on the runtime environment (PATH layout, shell startup cost, lazy `where_command` lookups, etc.). Module import itself stays fast; only waiting for the probe results can block.

- Type: `Available` — a thenable that resolves to `AvailableShells` (`Record<'sh' | 'bash' | 'powershell' | 'pwsh', boolean>`).
- `await available` — wait for all probes and get the full snapshot.
- `available.sh`, `available.bash`, etc. — each is `Promise<boolean>` until that shell’s probe finishes, then becomes `boolean`. Use `await available.bash` (or rely on `bash_exec`, which awaits internally) before branching on availability.

### `shell_exec_map`

Maps shell names to their execution functions.

- Type: `Record<'sh' | 'bash' | 'powershell' | 'pwsh', (code: string, options?) => Promise<ExecResult>>`
- Keys: `'sh'`, `'bash'`, `'powershell'`, `'pwsh'`

### TypeScript types

`index.d.mts` also exports:

- `ExecOptions`, `ExecSpawnOptions`, `ExecFileOptions` — options passed to execution functions
- `ExecResultForOptions<O>` — conditional result type when `no_output_record` is set
- `ShellName`, `AvailableShells`, `Available`

### Options (`options`)

All execution functions accept an optional `options` object. Most fields are forwarded to `child_process.spawn`:

- `cwd`: Working directory for the child process.
- `env`: Environment variables for the child process.
- `stdio`, `uid`, `gid`, `detached`, and other [spawn options](https://nodejs.org/api/child_process.html#child_processspawncommand-args-options) are supported.

Package-specific options (not passed to `spawn`):

- `no_ansi_terminal_sequences`: (boolean) Strip ANSI sequences from buffered stdout, stderr, and stdall before resolve. Defaults to `false`. Does not modify data passed to stream callbacks.
- `no_output_record`: (boolean) Skip accumulating stdout/stderr/stdall. The Promise resolves with `{ code, signal }` only. Stream callbacks still run. Defaults to `false`.
- `on_spawn`: `(child: ChildProcess) => void` — called immediately after spawn; use `child.pid` for resource monitoring, etc.
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
