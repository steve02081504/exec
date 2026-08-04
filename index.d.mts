import type { ChildProcess, SpawnOptionsWithoutStdio } from 'node:child_process'

/**
 * 子进程执行结果（含累积输出）。
 */
export interface ExecResult {
	/** 退出码；进程被信号终止时为 `null` */
	code: number | null
	/** 终止信号；正常退出时为 `null` */
	signal: NodeJS.Signals | null
	/** 累积的 stdout 文本（UTF-8） */
	stdout: string
	/** 累积的 stderr 文本（UTF-8） */
	stderr: string
	/** stdout 与 stderr 合并后的文本 */
	stdall: string
}

/**
 * 子进程执行结果（不含输出字段）。
 * 当 {@link ExecOptions.no_output_record} 为 `true` 时使用。
 */
export interface ExecResultWithoutOutput {
	code: number | null
	signal: NodeJS.Signals | null
}

/**
 * `execFile` 及 shell 执行函数的扩展选项。
 * 除本接口字段外，其余选项（如 `cwd`、`env`）透传给 `child_process.spawn`。
 */
export interface ExecOptions {
	/** 是否在 resolve 前从累积的输出中移除 ANSI 终端序列 */
	no_ansi_terminal_sequences?: boolean
	/** 是否跳过 stdout/stderr/stdall 的累积；为 `true` 时 Promise 仅 resolve `{ code, signal }`。流式回调仍会触发 */
	no_output_record?: boolean
	/** 子进程 spawn 后立即调用，便于读取 `child.pid` 等 */
	on_spawn?: (child: ChildProcess) => void
	/** 每次收到 stdout 数据块时调用（UTF-8 字符串） */
	on_stdout?: (data: string) => void
	/** 每次收到 stderr 数据块时调用（UTF-8 字符串） */
	on_stderr?: (data: string) => void
	/** 每次收到 stdout 或 stderr 数据块时调用（在 `on_stdout` / `on_stderr` 之后） */
	on_stdall?: (data: string) => void
	/** 子进程关闭时调用 */
	on_close?: (code: number | null, signal: NodeJS.Signals | null) => void
}

/** 透传给 `spawn` 的选项（不含 {@link ExecOptions} 字段） */
export type ExecSpawnOptions = Omit<SpawnOptionsWithoutStdio, keyof ExecOptions>

/** `execFile` 及 shell 执行函数接受的完整选项 */
export type ExecFileOptions = ExecOptions & ExecSpawnOptions

/** 根据 `no_output_record` 推断 Promise 的 resolve 类型 */
export type ExecResultForOptions<O extends ExecOptions | undefined> =
	O extends { no_output_record: true } ? ExecResultWithoutOutput : ExecResult

export type ShellName = 'pwsh' | 'powershell' | 'bash' | 'sh'

/** 各 shell 是否可用的快照 */
export type AvailableShells = Record<ShellName, boolean>

/**
 * 指示哪些 shell 可用。模块加载时在后台异步探测路径；各 `*_exec` 会在执行前 `await` 对应项。
 * 整体 `await available` 得到 {@link AvailableShells}；`available.sh` 等在探测完成前为 `Promise<boolean>`，之后为 `boolean`。
 */
export interface Available extends Promise<AvailableShells> {
	[key: ShellName]: boolean | Promise<boolean>
}

/**
 * 从字符串中移除 ANSI 终端序列。
 */
export declare function removeTerminalSequences(str: string): string

/**
 * 直接执行可执行文件，参数为 argv 数组。
 */
export declare function execFile<O extends ExecFileOptions | undefined = ExecFileOptions>(
	file: string,
	args?: string[],
	options?: O,
): Promise<ExecResultForOptions<O>>

/**
 * 使用 sh 执行一个命令字符串。会等待 {@link available.sh} 探测完成。
 */
export declare function sh_exec<O extends ExecFileOptions | undefined = ExecFileOptions>(
	code: string,
	options?: O,
): Promise<ExecResultForOptions<O>>

/**
 * 使用 bash 执行一个命令字符串。会等待 {@link available.bash} 探测完成。
 */
export declare function bash_exec<O extends ExecFileOptions | undefined = ExecFileOptions>(
	code: string,
	options?: O,
): Promise<ExecResultForOptions<O>>

/**
 * 使用 Windows PowerShell 执行一个命令字符串。会等待 {@link available.powershell} 探测完成。
 */
export declare function powershell_exec<O extends ExecFileOptions | undefined = ExecFileOptions>(
	code: string,
	options?: O,
): Promise<ExecResultForOptions<O>>

/**
 * 使用 PowerShell (Core) 执行一个命令字符串，如果 pwsh 不可用则使用 powershell.exe。
 * 会等待 {@link available.pwsh}（或 {@link available.powershell}）探测完成。
 */
export declare function pwsh_exec<O extends ExecFileOptions | undefined = ExecFileOptions>(
	code: string,
	options?: O,
): Promise<ExecResultForOptions<O>>

/**
 * 跨平台查找可执行文件的完整路径 (类似于 `which` 或 `where`)。
 * 在 Windows 上按 PATHEXT 返回可直接 spawn 的路径（如 `npx.cmd` 而非无后缀的 `npx`）。
 */
export declare function where_command(command: string): Promise<string>

/** 指示哪些 shell 可用 */
export declare const available: Available

/** 将 shell 名称映射到其执行函数 */
export declare const shell_exec_map: Record<
	ShellName,
	<O extends ExecFileOptions | undefined = ExecFileOptions>(
		code: string,
		options?: O,
	) => Promise<ExecResultForOptions<O>>
>

/**
 * 使用当前平台的默认 shell 执行一个命令字符串。
 * 在 Windows 上默认为 PowerShell (Core) 或 Windows PowerShell，在其他系统上默认为 bash 或 sh。
 * 非 Windows 且 bash 与 sh 均不可用时抛出 `Error('No shell available')`。
 */
export declare function exec<O extends ExecFileOptions | undefined = ExecFileOptions>(
	str: string,
	options?: O,
): Promise<ExecResultForOptions<O>>
