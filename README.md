# @steve02081504/exec

A simple cross-platform Shell command execution utility. It wraps Node.js's `child_process.spawn` to provide a consistent interface for `sh`, `bash`, `PowerShell`, and `pwsh`.

## Features

- **Multi-Shell Support**: Automatically detects and supports `sh`, `bash`, `powershell` (Windows PowerShell), and `pwsh` (PowerShell Core).
- **Cross-Platform**: Defaults to PowerShell on Windows and bash/sh on Linux/macOS.
- **Promise-based API**: All execution functions return a Promise, making them easy to use with `async/await`.
- **Output Processing**: Supports automatic removal of ANSI terminal sequences (color codes, etc.) and provides stdout, stderr, and a combined `stdall` output.
- **Command Discovery**: Includes `where_command` to find the full path of executables across platforms.

## Installation

```bash
npm install @steve02081504/exec
```

## Usage

```javascript
import { exec, powershell_exec, bash_exec } from '@steve02081504/exec';

// 1. Execute using the default Shell (PowerShell on Windows, bash/sh on *nix)
const result = await exec('echo "Hello World"');
console.log(result.stdout); // "Hello World\n"

// 2. Explicitly use PowerShell
const psResult = await powershell_exec('Get-Date');
console.log(psResult.stdout);

// 3. Explicitly use Bash
// Note: May fail on Windows if WSL or Git Bash is not in PATH
try {
    const bashResult = await bash_exec('ls -la');
    console.log(bashResult.stdout);
} catch (e) {
    console.error("Bash usage failed:", e);
}

// 4. Detailed execution result
const { code, stdout, stderr, stdall } = await exec('ls_non_existent_file');
if (code !== 0) {
    console.error(`Command failed with code ${code}`);
    console.error(`Error output: ${stderr}`);
}
```

## API Reference

### `exec(code, options)`
Executes a command string using the platform's default shell (PowerShell on Windows, bash/sh on others).
- `code`: The command string to execute.
- `options`: Optional configuration object (see below).
- Returns: `Promise<{code: number, stdout: string, stderr: string, stdall: string}>`

### `sh_exec(code, options)`
Force execution using `sh`.
- `code`: The command string to execute.
- `options`: Optional configuration object.
- Returns: `Promise<{code: number, stdout: string, stderr: string, stdall: string}>`

### `bash_exec(code, options)`
Force execution using `bash`.
- `code`: The command string to execute.
- `options`: Optional configuration object.
- Returns: `Promise<{code: number, stdout: string, stderr: string, stdall: string}>`

### `powershell_exec(code, options)`
Force execution using Windows PowerShell (`powershell.exe`).
- `code`: The command string to execute.
- `options`: Optional configuration object.
- Returns: `Promise<{code: number, stdout: string, stderr: string, stdall: string}>`

### `pwsh_exec(code, options)`
Force execution using PowerShell Core (`pwsh`).
- `code`: The command string to execute.
- `options`: Optional configuration object.
- Returns: `Promise<{code: number, stdout: string, stderr: string, stdall: string}>`

### `where_command(command)`
Cross-platform tool to find the full path of a command (similar to `which` or `where`).
- `command`: The name of the command to find.
- Returns: `Promise<string>` - The full path of the command, or an empty string if not found.

### `removeTerminalSequences(str)`
Removes ANSI terminal sequences (like color codes) from a string.
- `str`: The string to process.
- Returns: `string` - The cleaned string.

### `available`
An object indicating which shells are available on the current system.
- Type: `{ pwsh: boolean, powershell: boolean, bash: boolean, sh: boolean }`

### `shell_exec_map`
An object mapping shell names to their corresponding execution functions.
- Type: `Record<string, Function>`
- Keys: `'pwsh'`, `'powershell'`, `'bash'`, `'sh'`

### Options (`options`)
All execution functions accept an optional `options` object:
- `cwd`: (string) Current working directory.
- `no_ansi_terminal_sequences`: (boolean) Whether to strip ANSI terminal sequences (like color codes) from the output. Defaults to `false`.
- `shell`: (string) Path to a specific shell (usually handled automatically by specific exec functions).
- `args`: (string[]) Extra arguments to pass to the shell.
- `cmdswitch`: (string) The shell's command switch (e.g., `-c` for sh/bash, `-Command` for PowerShell). Defaults usually handled automatically.
