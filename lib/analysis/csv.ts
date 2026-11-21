import type { DatasetProfile } from './types'

export const MAX_CSV_BYTES = 1_048_576
export const MAX_ROWS = 10_000
const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/

export function numericValue(value: string) {
  const text = value.trim()
  if (!NUMBER_PATTERN.test(text)) return null
  const number = Number(text)
  return Number.isFinite(number) && Math.abs(number) <= 1e12 ? number : null
}

export function parseCsv(csv: string): DatasetProfile {
  if (new TextEncoder().encode(csv).length > MAX_CSV_BYTES) {
    throw new Error('CSV 文件不能超过 1 MiB。')
  }
  const text = csv.replace(/^\uFEFF/, '')
  const records: string[][] = []
  let row: string[] = []
  let value = ''
  let quoted = false
  let afterQuote = false
  const finishValue = () => { row.push(value); value = ''; afterQuote = false }
  const finishRow = () => {
    finishValue()
    if (row.some((cell) => cell.trim() !== '')) records.push(row)
    row = []
    if (records.length > MAX_ROWS + 1) throw new Error('首版支持最多 10,000 行数据。')
  }
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { value += '"'; index++ }
      else if (char === '"') { quoted = false; afterQuote = true }
      else value += char
    } else if (char === ',') finishValue()
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++
      finishRow()
    } else if (char === '"' && value === '' && !afterQuote) quoted = true
    else if (afterQuote || char === '"') throw new Error('CSV 引号格式有误，请检查引号和分隔符。')
    else value += char
  }
  if (quoted) throw new Error('CSV 存在未闭合的引号。')
  if (value !== '' || row.length > 0 || afterQuote) finishRow()
  if (records.length < 2) throw new Error('CSV 至少需要一行表头和一行有效数据。')
  const headers = records.shift()!.map((header) => header.trim())
  if (headers.length > 40) throw new Error('首版支持最多 40 列。')
  if (headers.some((header) => !header || header.length > 160)) throw new Error('每列都需要一个不超过 160 字的表头。')
  if (new Set(headers).size !== headers.length) throw new Error('CSV 表头不能重复。')
  if (records.some((record) => record.length !== headers.length)) throw new Error('CSV 每行的列数必须与表头一致。')
  const columns = headers.map((name, columnIndex) => {
    const values = records.map((record) => record[columnIndex].trim())
    const present = values.filter(Boolean)
    return {
      name,
      kind: present.length > 0 && present.every((item) => numericValue(item) !== null)
        ? 'number' as const : 'text' as const,
      missing: values.length - present.length,
      unique: new Set(present).size,
    }
  })
  return {
    columns,
    rows: records,
    rowCount: records.length,
    missingCells: columns.reduce((sum, column) => sum + column.missing, 0),
    duplicateRows: records.length - new Set(records.map((record) => JSON.stringify(record))).size,
  }
}

export function csvCell(value: string | number) {
  const text = String(value)
  // Prevent exported labels from being interpreted as spreadsheet formulas.
  const safe = typeof value === 'string' && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}
