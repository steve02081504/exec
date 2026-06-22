import assert from 'node:assert/strict'
import process from 'node:process'
import { test } from 'node:test'

import { available, bash_exec, exec, execFile, pwsh_exec, removeTerminalSequences, where_command } from '../index.mjs'

/**
 * @param {{ stdout: string, stderr: string, stdall: string }} result - 执行结果。
 */
function assertStreamsConsistent(result) {
	assert.equal(result.stdall, result.stdout + result.stderr, 'stdall must be stdout + stderr')
}

/**
 * @param {{ stdout: string, stderr: string, stdall: string, code: number | null, signal: unknown }} a - 第一个执行结果。
 * @param {typeof a} b - 第二个执行结果，应与第一个相等。
 */
function assertExecResultsEqual(a, b) {
	assert.equal(a.stdout, b.stdout, 'stdout mismatch')
	assert.equal(a.stderr, b.stderr, 'stderr mismatch')
	assert.equal(a.stdall, b.stdall, 'stdall mismatch')
	assert.equal(a.code, b.code, 'code mismatch')
	assert.equal(a.signal, b.signal, 'signal mismatch')
}

test('execFile runs argv', async () => {
	const result = await execFile(process.execPath, ['-e', 'console.log("ok")'])
	assert.equal(result.code, 0)
	assert.match(result.stdout, /ok/)
	assert.equal(result.signal, null)
	assertStreamsConsistent(result)
})

test('execFile respects cwd', async () => {
	const cwd = process.env.TEMP || process.env.TMP || '/tmp'
	const result = await execFile(process.execPath, ['-e', 'console.log(process.cwd())'], { cwd })
	assert.equal(result.code, 0)
	assert.match(result.stdout.trim(), new RegExp(cwd.replace(/\\/g, '\\\\')))
	assertStreamsConsistent(result)
})

test('execFile stream callbacks receive stdout, stderr, and stdall', async () => {
	const stdoutChunks = []
	const stderrChunks = []
	const stdallChunks = []
	const result = await execFile(process.execPath, [
		'-e',
		'process.stdout.write("out\\n"); process.stderr.write("err")',
	], {
		on_stdout: data => stdoutChunks.push(data),
		on_stderr: data => stderrChunks.push(data),
		on_stdall: data => stdallChunks.push(data),
	})
	assert.equal(result.code, 0)
	assert.match(stdoutChunks.join(''), /out/)
	assert.match(stderrChunks.join(''), /err/)
	assert.equal(stdallChunks.join(''), stdoutChunks.join('') + stderrChunks.join(''))
	assert.equal(result.stdout, stdoutChunks.join(''))
	assert.equal(result.stderr, stderrChunks.join(''))
	assertStreamsConsistent(result)
})

test('execFile on_stdall runs after on_stdout and on_stderr', async () => {
	const order = []
	await execFile(process.execPath, [
		'-e',
		'process.stdout.write("a"); process.stderr.write("b")',
	], {
		on_stdout: () => order.push('stdout'),
		on_stderr: () => order.push('stderr'),
		on_stdall: () => order.push('stdall'),
		no_output_record: true,
	})
	assert.deepEqual(order, ['stdout', 'stdall', 'stderr', 'stdall'])
})

test('execFile on_close receives exit code and signal', async () => {
	/** @type {[number | null, unknown] | undefined} */
	let closeArgs
	const result = await execFile(process.execPath, ['-e', 'process.exit(7)'], {
		on_close: (code, signal) => { closeArgs = [code, signal] },
	})
	assert.equal(result.code, 7)
	assert.equal(result.signal, null)
	assert.deepEqual(closeArgs, [7, null])
})

test('execFile no_output_record resolves without buffered output but keeps callbacks', async () => {
	const stdoutChunks = []
	const result = await execFile(process.execPath, ['-e', 'console.log("hi")'], {
		no_output_record: true,
		on_stdout: data => stdoutChunks.push(data),
	})
	assert.equal(result.code, 0)
	assert.equal(result.signal, null)
	assert.equal('stdout' in result, false)
	assert.equal('stderr' in result, false)
	assert.equal('stdall' in result, false)
	assert.match(stdoutChunks.join(''), /hi/)
})

test('execFile no_ansi_terminal_sequences strips buffered output only', async () => {
	const raw = '\x1B[31mhi\x1B[0m'
	/** @type {string | undefined} */
	let callbackData
	const result = await execFile(process.execPath, [
		'-e',
		`process.stdout.write(${JSON.stringify(raw)})`,
	], {
		no_ansi_terminal_sequences: true,
		on_stdout: data => { callbackData = data },
	})
	assert.equal(result.code, 0)
	assert.equal(result.stdout, 'hi')
	assert.equal(callbackData, raw)
	assertStreamsConsistent(result)
})

test('exec stream callbacks work through shell execution', async () => {
	const stdallChunks = []
	const result = await exec(
		process.platform === 'win32'
			? 'Write-Output "shell-out"'
			: 'printf shell-out',
		{
			on_stdall: data => stdallChunks.push(data),
		},
	)
	assert.equal(result.code, 0)
	assert.match(stdallChunks.join(''), /shell-out/)
	assert.match(result.stdout, /shell-out/)
	assertStreamsConsistent(result)
})

test('exec forwards env to child process', async () => {
	const marker = `exec_test_${Date.now()}`
	const result = await exec(
		process.platform === 'win32'
			? 'Write-Output $env:EXEC_TEST_MARKER'
			: 'echo $EXEC_TEST_MARKER',
		{ env: { ...process.env, EXEC_TEST_MARKER: marker } },
	)
	assert.equal(result.code, 0)
	assert.match(result.stdout, new RegExp(marker))
	assertStreamsConsistent(result)
})

test('removeTerminalSequences strips CSI, OSC, and cursor codes', () => {
	const input = [
		'\x1B[31mred\x1B[0m',
		'\x1B[38;2;255;0;0mrgb\x1B[0m',
		'\x1B[38:2:255:0:0mcolon\x1B[0m',
		'\x1B[2Jclear\x1B[10A',
		'\x1B]8;;https://example.com\x07link\x1B]8;;\x07',
	].join('')
	assert.equal(removeTerminalSequences(input), 'redrgbcolonclearlink')
})

test('where_command returns spawnable path on Windows', { skip: process.platform !== 'win32' }, async () => {
	const path = await where_command('node')
	assert.ok(path)
	assert.match(path.toLowerCase(), /\.exe$/)

	const spawnResult = await execFile(path, ['-e', 'console.log(1)'])
	assert.equal(spawnResult.code, 0)
	assert.match(spawnResult.stdout, /1/)
	assertStreamsConsistent(spawnResult)
})

const NO_NEWLINE_2KB_SIZE = 2048
const NO_NEWLINE_2KB_EXPECTED = 'x'.repeat(NO_NEWLINE_2KB_SIZE)
const NO_NEWLINE_2KB_COMMAND = String.raw`node -e "process.stdout.write('x'.repeat(${NO_NEWLINE_2KB_SIZE}))"`

/**
 * @param {{ stdout: string }} result - 执行结果。
 */
function assertNoNewlines(result) {
	assert.doesNotMatch(result.stdout, /[\r\n]/, 'stdout must not contain line breaks')
	assert.equal(result.stdout.length, NO_NEWLINE_2KB_SIZE)
	assert.equal(result.stdout, NO_NEWLINE_2KB_EXPECTED)
}

test('bash outputs 2KB without newlines', { skip: !available.bash }, async () => {
	const result = await bash_exec(NO_NEWLINE_2KB_COMMAND)
	assert.equal(result.code, 0)
	assertNoNewlines(result)
	assertStreamsConsistent(result)
})

test('pwsh outputs 2KB without newlines', { skip: !available.pwsh && !available.powershell }, async () => {
	const result = await pwsh_exec(NO_NEWLINE_2KB_COMMAND)
	assert.equal(result.code, 0)
	assertNoNewlines(result)
	assertStreamsConsistent(result)
})

test('bash and pwsh agree on stdout, stderr, and stdall for the same command', {
	skip: !available.bash || (!available.pwsh && !available.powershell),
}, async (t) => {
	const cases = [
		{
			name: 'stdout only',
			command: String.raw`node -e "process.stdout.write('hello\n')"`,
		},
		{
			name: 'stderr only',
			command: String.raw`node -e "process.stderr.write('err')"`,
		},
		{
			name: 'stdout and stderr',
			command: String.raw`node -e "process.stdout.write('out\n'); process.stderr.write('err')"`,
		},
		{
			name: 'empty output',
			command: String.raw`node -e "process.exit(0)"`,
		},
		{
			name: 'non-zero exit with output',
			command: String.raw`node -e "process.stdout.write('x'); process.exit(42)"`,
		},
		{
			name: 'env forwarded through shell',
			command: String.raw`node -e "process.stdout.write(process.env.EXEC_SHELL_PARITY || '')"`,
			options: { env: { ...process.env, EXEC_SHELL_PARITY: 'marker' } },
		},
	]

	for (const { name, command, options } of cases) 
		await t.test(name, async () => {
			const bash = await bash_exec(command, options)
			const pwsh = await pwsh_exec(command, options)
			assertStreamsConsistent(bash)
			assertStreamsConsistent(pwsh)
			assertExecResultsEqual(bash, pwsh)
		})
	
})
