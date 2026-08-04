import assert from 'node:assert/strict'
import process from 'node:process'
import { test } from 'node:test'

import { available, pwsh_exec, shell_exec_map } from '../index.mjs'

const SHELL_NAMES = /** @type {const} */ (['sh', 'bash', 'powershell', 'pwsh'])
const shells = await available

test('available resolves to a snapshot of all shell keys', async () => {
	const shells = await available
	for (const key of SHELL_NAMES)
		assert.equal(typeof shells[key], 'boolean', `${key} should be boolean in snapshot`)
})

test('available shell properties become boolean after await available', async () => {
	const shells = await available
	for (const key of SHELL_NAMES) {
		assert.equal(typeof available[key], 'boolean', `${key} should be boolean on available`)
		assert.equal(available[key], shells[key])
	}
})

test('individual available.* probes resolve to the same value as the snapshot', async () => {
	const shells = await available
	for (const key of SHELL_NAMES)
		assert.equal(await available[key], shells[key])
})

test('shell_exec_map runs commands for each available shell', async () => {
	for (const name of SHELL_NAMES) {
		if (!shells[name]) continue
		const cmd = process.platform === 'win32' && (name === 'powershell' || name === 'pwsh')
			? 'Write-Output "map-ok"'
			: 'printf map-ok'
		const result = await shell_exec_map[name](cmd)
		assert.equal(result.code, 0)
		assert.match(result.stdout, /map-ok/)
		assert.equal(result.stdall, result.stdout + result.stderr)
	}
})

test('pwsh_exec falls back to powershell when pwsh is unavailable', {
	skip: shells.pwsh || !shells.powershell,
}, async () => {
	const result = await pwsh_exec('Write-Output "fallback-ok"')
	assert.equal(result.code, 0)
	assert.match(result.stdout, /fallback-ok/)
})
