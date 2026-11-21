import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, it } from 'node:test'
import { compilePython, RESULT_MARKER } from './python'
import { parseCsv } from './csv'
import { computeAnalysis, verifyAnalysis } from './compute'
import { sampleDataset } from './sample'
import type { AnalysisSpec } from './types'

const pythonAvailable = spawnSync('python', ['--version'], { encoding: 'utf8', timeout: 5000 }).status === 0

describe('compiled Python against the TypeScript reference', () => {
  for (const aggregation of ['sum', 'mean', 'count'] as const) {
    it(`executes equivalent ${aggregation} results`, { skip: !pythonAvailable }, () => {
      const directory = mkdtempSync(join(tmpdir(), 'insightpilot-analysis-'))
      try {
        const path = join(directory, 'input.csv')
        const spec: AnalysisSpec = { title: 'Python parity', kind: 'aggregate', groupBy: 'channel', metric: aggregation === 'count' ? null : 'revenue', aggregation }
        const edgeCsv = '\uFEFFchannel,revenue\r\n"Search, ads",1.5\r\n"Email ""A""",-2\r\n"Multi\nline",\r\n,3e1\r\n"Search, ads",1.5\r\n'
        for (const csv of [sampleDataset.csv, edgeCsv]) {
          writeFileSync(path, csv)
          const execution = spawnSync('python', ['-c', compilePython(spec, path).code], { encoding: 'utf8', timeout: 5000, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } })
          assert.equal(execution.status, 0, execution.stderr)
          const values = JSON.parse(execution.stdout.trim().slice(RESULT_MARKER.length))
          assert.ok(verifyAnalysis(values, computeAnalysis(parseCsv(csv), spec)).every((check) => check.passed))
        }
      } finally { rmSync(directory, { recursive: true, force: true }) }
    })
  }
})
