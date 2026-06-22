import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import process from 'node:process'

import ansiRegex from 'ansi-regex'

const ansiPattern = ansiRegex()

/**
 * @typedef {{ code: number | null, signal: NodeJS.Signals | null, stdout: string, stderr: string, stdall: string }} ExecResult
 */

/**
 * @typedef {{ code: number | null, signal: NodeJS.Signals | null }} ExecResultWithoutOutput
 */

/**
 * @typedef {object} ExecOptions
 * @property {boolean} [no_ansi_terminal_sequences=false] - 是否在 resolve 前从累积的输出中移除 ANSI 终端序列。
 * @property {boolean} [no_output_record=false] - 是否跳过 stdout/stderr/stdall 的累积；为 true 时 Promise 仅 resolve `{ code, signal }`。流式回调仍会触发。
 * @property {(data: string) => void} [on_stdout] - 每次收到 stdout 数据块时调用（UTF-8 字符串）。
 * @property {(data: string) => void} [on_stderr] - 每次收到 stderr 数据块时调用（UTF-8 字符串）。
 * @property {(data: string) => void} [on_stdall] - 每次收到 stdout 或 stderr 数据块时调用（在 `on_stdout` / `on_stderr` 之后）。
 * @property {(code: number | null, signal: NodeJS.Signals | null) => void} [on_close] - 子进程关闭时调用。
 */

/**
 * 从字符串中移除 ANSI 终端序列。
 * @param {string} str - 要处理的字符串。
 * @returns {string} - 清理后的字符串。
 */
export function removeTerminalSequences(str) {
	return str.replace(ansiPattern, '')
}

/**
 * 直接执行可执行文件，参数为 argv 数组。
 * @param {string} file - 可执行文件路径。
 * @param {string[]} [args=[]] - 参数列表。
 * @param {ExecOptions & object} [options] - {@link ExecOptions} 中的字段不会传给 `spawn`；其余选项（如 `cwd`、`env`）透传给 `spawn`。
 * @returns {Promise<ExecResult | ExecResultWithoutOutput>} - 执行结果；`no_output_record` 为 true 时不含输出字段。
 */
export function execFile(file, args = [], options = {}) {
	const {
		no_ansi_terminal_sequences = false,
		no_output_record = false,
		on_stdout = undefined,
		on_stderr = undefined,
		on_stdall = undefined,
		on_close = undefined,
		...others
	} = options
	options = {
		windowsHide: true,
		...others,
	}
	for (const key of ['no_ansi_terminal_sequences', 'no_output_record', 'on_stdout', 'on_stderr', 'on_stdall', 'on_close'])
		delete options[key]
	return new Promise((resolve, reject) => {
		const process = spawn(file, args, options)
		process.on('error', reject)
		process.stdout?.setEncoding?.('utf8')
		process.stderr?.setEncoding?.('utf8')
		let stdout = ''
		let stderr = ''
		let stdall = ''
		process.stdout?.on?.('data', data => {
			on_stdout?.(data)
			on_stdall?.(data)
			if (no_output_record) return
			stdout += data
			stdall += data
		})
		process.stderr?.on?.('data', data => {
			on_stderr?.(data)
			on_stdall?.(data)
			if (no_output_record) return
			stderr += data
			stdall += data
		})
		process.on('close', (code, signal) => {
			signal ??= null
			on_close?.(code, signal)
			if (no_ansi_terminal_sequences)
				[stdout, stderr, stdall] = [stdout, stderr, stdall].map(removeTerminalSequences)
			if (no_output_record) return resolve({ code, signal })
			resolve({ code, signal, stdout, stderr, stdall })
		})
	})
}

/**
 * 执行命令的基础函数。
 * @param {string} code - 要执行的代码。
 * @param {ExecOptions & { shell: string, cmdswitch?: string, args?: string[] }} options - 除 `shell`、`cmdswitch`、`args` 及 {@link ExecOptions} 字段外透传给 `spawn`。
 * @returns {Promise<ExecResult | ExecResultWithoutOutput>} - 执行结果。
 */
function base_exec(code, {
	shell,
	cmdswitch = '-c',
	args = [],
	...spawnOptions
}) {
	return execFile(shell, [...args, cmdswitch, code], spawnOptions)
}

/**
 * 使用 sh 执行命令的基础函数。
 * @param {string} shellpath - sh 的路径。
 * @param {string} code - 要执行的代码。
 * @param {ExecOptions & object} [options] - 透传给 `execFile`。
 * @returns {Promise<ExecResult | ExecResultWithoutOutput>} - 执行结果。
 */
function base_sh_exec(shellpath, code, options) {
	return base_exec(code, {
		shell: shellpath,
		...options
	})
}
/**
 * 使用 pwsh 执行命令的基础函数。
 * @param {string} shellpath - pwsh 的路径。
 * @param {string} code - 要执行的代码。
 * @param {ExecOptions & object} [options] - 透传给 `execFile`。
 * @returns {Promise<ExecResult | ExecResultWithoutOutput>} - 执行结果。
 */
function base_pwsh_exec(shellpath, code, options) {
	code = `\
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::UTF8
${code}
exit $LASTEXITCODE`
	return base_exec(code, {
		shell: shellpath,
		args: ['-NoProfile', '-NoLogo', '-NonInteractive'],
		cmdswitch: '-Command',
		...options
	})
}
/**
 * 测试 sh 路径是否可用。
 * @param {string[]} paths - 要测试的路径数组。
 * @returns {Promise<string | undefined>} - 可用的路径，如果没有则返回 undefined。
 */
async function testShPaths(paths) {
	for (const path of paths)
		if (await base_sh_exec(path, 'echo 1').catch(() => false))
			return path
}
/**
 * 测试 pwsh 路径是否可用。
 * @param {string[]} paths - 要测试的路径数组。
 * @returns {Promise<string | undefined>} - 可用的路径，如果没有则返回 undefined。
 */
async function testPwshPaths(paths) {
	for (const path of paths)
		if (await base_pwsh_exec(path, '1').catch(() => false))
			return path
}

const powershellPath = await testPwshPaths([
	'powershell.exe',
	'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
])

let shPath
let bashPath
let pwshPath

/**
 * 使用 sh 执行一个命令字符串。
 * @param {string} code - 要执行的命令。
 * @param {ExecOptions & object} [options] - 透传给 `execFile`。
 * @returns {Promise<ExecResult | ExecResultWithoutOutput>} - 执行结果。
 */
export function sh_exec(code, options) {
	return base_sh_exec(shPath ?? '/bin/sh', code, options)
}
/**
 * 使用 bash 执行一个命令字符串。
 * @param {string} code - 要执行的命令。
 * @param {ExecOptions & object} [options] - 透传给 `execFile`。
 * @returns {Promise<ExecResult | ExecResultWithoutOutput>} - 执行结果。
 */
export function bash_exec(code, options) {
	return base_sh_exec(bashPath ?? '/bin/bash', code, options)
}
/**
 * 使用 Windows PowerShell 执行一个命令字符串。
 * @param {string} code - 要执行的命令。
 * @param {ExecOptions & object} [options] - 透传给 `execFile`。
 * @returns {Promise<ExecResult | ExecResultWithoutOutput>} - 执行结果。
 */
export function powershell_exec(code, options) {
	return base_pwsh_exec(powershellPath, code, options)
}
/**
 * 使用 PowerShell (Core) 执行一个命令字符串，如果 pwsh 不可用则使用 powershell.exe。
 * @param {string} code - 要执行的命令。
 * @param {ExecOptions & object} [options] - 透传给 `execFile`。
 * @returns {Promise<ExecResult | ExecResultWithoutOutput>} - 执行结果。
 */
export function pwsh_exec(code, options) {
	return base_pwsh_exec(pwshPath ?? powershellPath, code, options)
}

/**
 * 跨平台查找可执行文件的完整路径 (类似于 `which` 或 `where`)。
 * 在 Windows 上按 PATHEXT 返回可直接 spawn 的路径（如 `npx.cmd` 而非无后缀的 `npx`）。
 * @param {string} command - 要查找的命令名称。
 * @returns {Promise<string>} - 命令的完整路径，如果找不到则为空字符串。
 */
export async function where_command(command) {
	if (process.platform !== 'win32')
		return await sh_exec(`command -v ${command}`).then(result => result.stdout.trim())

	return await execFile(`${process.env.SYSTEMROOT}\\system32\\where.exe`, [command]).then(result => {
		const exts = (process.env.PATHEXT || '.com;.exe;.bat;.cmd').split(';').filter(Boolean).map(ext => ext.toLowerCase())
		return result.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean).find(path =>
			exts.some(
				ext => path.toLowerCase().endsWith(ext) || existsSync(path + ext)
			)
		) ?? ''
	})
}
shPath = await testShPaths([
	'sh',
	'sh.exe',
	'/bin/sh',
	await where_command('sh').catch(() => ''),
].filter(x => x))
bashPath = await testShPaths([
	'bash',
	'bash.exe',
	'/bin/bash',
	'/usr/bin/bash',
	await where_command('bash').catch(() => ''),
].filter(x => x))
pwshPath = await testPwshPaths([
	'pwsh',
	'pwsh.exe',
	await where_command('pwsh').catch(() => ''),
].filter(x => x))

/**
 * 一个对象，指示哪些 shell 可用。
 * @type {{ pwsh: boolean, powershell: boolean, bash: boolean, sh: boolean }}
 */
export const available = {
	pwsh: !!pwshPath,
	powershell: !!powershellPath,
	bash: !!bashPath,
	sh: !!shPath,
}

/**
 * 一个将 shell 名称映射到其执行函数的对象。
 * @type {Record<string, Function>}
 */
export const shell_exec_map = {
	pwsh: pwsh_exec,
	powershell: powershell_exec,
	bash: bash_exec,
	sh: sh_exec,
}

/**
 * 使用当前平台的默认 shell 执行一个命令字符串。
 * 在 Windows 上默认为 PowerShell (Core) 或 Windows PowerShell，在其他系统上默认为 bash 或 sh。
 * @param {string} str - 要执行的命令。
 * @param {ExecOptions & object} [options] - 透传给 `execFile`。
 * @returns {Promise<ExecResult | ExecResultWithoutOutput>} - 执行结果。
 */
export function exec(str, options) {
	if (process.platform == 'win32') return pwsh_exec(str, options)
	else if (bashPath) return bash_exec(str, options)
	else if (shPath) return sh_exec(str, options)
	else throw new Error('No shell available')
}
