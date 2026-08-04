import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { removeTerminalSequences } from '../index.mjs'

const indexUrl = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '../index.mjs')).href

/**
 * 在独立 Node 进程中测量 index.mjs 的冷导入耗时。
 * @returns {number} 毫秒数。
 */
function measureColdImportMs() {
	const code = `(async()=>{const t=performance.now();await import(${JSON.stringify(indexUrl)});process.stdout.write(String(Math.round(performance.now()-t))+'\\n')})()`
	const { status, stdout, stderr } = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
		encoding: 'utf8',
		windowsHide: true,
		env: { ...process.env, NO_COLOR: '1', NODE_DISABLE_COLORS: '1' },
	})
	if (status !== 0)
		throw new Error(`import benchmark exited with code ${status}${stderr ? `: ${stderr.trim()}` : ''}`)
	const line = removeTerminalSequences(stdout).trim().split(/\r?\n/).at(-1) ?? ''
	const ms = Number(line)
	assert.ok(Number.isFinite(ms), `expected numeric stdout, got ${JSON.stringify(stdout)}${stderr ? `; stderr: ${stderr.trim()}` : ''}`)
	return ms
}

test('reports module import time', () => {
	const ms = measureColdImportMs()
	console.log(`import index.mjs: ${ms}ms`)
	assert.ok(!Number.isNaN(ms), 'expected numeric stdout, got NaN')
	assert.ok(ms < 100, 'import time should be less than 100ms')
})
