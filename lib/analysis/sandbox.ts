import { Sandbox } from '@e2b/code-interpreter'
import { RESULT_MARKER } from './python'
import { computedAnalysisSchema, type ExecutionPhase } from './types'
import type { ProgressReporter } from './execution-progress'

export class SandboxExecutionError extends Error {
  constructor(public phase: ExecutionPhase, cause: unknown) {
    super(cause instanceof Error && /[\u4e00-\u9fff]/.test(cause.message) ? cause.message : '沙箱执行未完成，请检查 E2B Key、额度或网络后重试。', { cause })
    this.name = 'SandboxExecutionError'
  }
}

type SandboxHandle = Pick<Sandbox, 'sandboxId' | 'files' | 'runCode' | 'kill'>
export type SandboxFactory = (apiKey: string) => Promise<SandboxHandle>
const createSandbox: SandboxFactory = (apiKey) => Sandbox.create({
  apiKey,
  timeoutMs: 90_000,
  allowInternetAccess: false,
})

export async function runInSandbox(
  csv: string,
  code: string,
  apiKey: string,
  progress: ProgressReporter,
  factory: SandboxFactory = createSandbox,
) {
  let sandbox: SandboxHandle | undefined
  let cleanup: 'completed' | 'failed' = 'completed'
  let values
  let phase: ExecutionPhase = 'sandbox'
  try {
    progress('sandbox', 'running', '创建 E2B Python 沙箱 · 外部网络关闭 · 最长 90 秒')
    sandbox = await factory(apiKey)
    progress('sandbox', 'completed', '沙箱创建完成 · 外部网络已关闭')
    phase = 'upload'
    progress('upload', 'running', '上传已批准的 CSV 到沙箱工作目录')
    await sandbox.files.write('/home/user/input.csv', csv)
    progress('upload', 'completed', 'CSV 上传完成')
    phase = 'analysis'
    progress('analysis', 'running', '运行计划中的 Python 分析代码')
    const execution = await sandbox.runCode(code, { timeoutMs: 30_000 })
    if (execution.error) throw new Error('Python 执行失败，请检查数据格式并重新规划。')
    const output = execution.logs.stdout.join('\n').split('\n')
      .find((line) => line.startsWith(RESULT_MARKER))
    if (!output) throw new Error('沙箱未返回可验证的结果。')
    values = computedAnalysisSchema.parse(JSON.parse(output.slice(RESULT_MARKER.length)))
    progress('analysis', 'completed', 'Python 计算完成，等待独立核验')
  } catch (error) {
    // Cleanup events must not obscure which operation actually failed.
    throw new SandboxExecutionError(phase, error)
  } finally {
    if (sandbox) {
      progress('cleanup', 'running', '正在释放沙箱资源')
      try {
        const killed = await sandbox.kill()
        cleanup = killed ? 'completed' : 'failed'
      } catch { cleanup = 'failed' }
      progress('cleanup', cleanup === 'completed' ? 'completed' : 'warning', cleanup === 'completed' ? '沙箱已释放' : '沙箱释放未确认；90 秒生命周期上限仍有效')
    }
  }
  return { values, sandboxId: sandbox!.sandboxId, cleanup }
}
