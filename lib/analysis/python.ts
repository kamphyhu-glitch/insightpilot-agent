import type { FragmentSchema } from '../schema'
import type { AnalysisSpec } from './types'

export const RESULT_MARKER = '__INSIGHTPILOT_RESULT__'

export function compilePython(spec: AnalysisSpec, dataPath = '/home/user/input.csv'): FragmentSchema {
  const code = `import csv, json, math, re
from collections import defaultdict

# Compiled from the validated plan; column names are JSON data, never source.
spec = json.loads(${JSON.stringify(JSON.stringify(spec))})
with open(${JSON.stringify(dataPath)}, encoding='utf-8-sig', newline='') as source:
    records = [r for r in csv.reader(source) if any(c.strip() for c in r)]
headers = [h.strip() for h in records[0]]
rows = records[1:]
metric_index = headers.index(spec['metric']) if spec['metric'] in headers else -1
group_index = headers.index(spec['groupBy']) if spec['groupBy'] in headers else -1
number_pattern = re.compile(r'^[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?$')
groups = defaultdict(lambda: {'sum': 0.0, 'count': 0})
total, valid = 0.0, 0
if spec['kind'] == 'aggregate':
    for row in rows:
        text = row[metric_index].strip() if metric_index >= 0 else ''
        if spec['aggregation'] == 'count':
            value = 1.0
        else:
            if not number_pattern.fullmatch(text):
                continue
            value = float(text)
            if not math.isfinite(value) or abs(value) > 1e12:
                continue
        label = (row[group_index].strip() or '(missing)') if group_index >= 0 else 'All rows'
        groups[label]['sum'] += value
        groups[label]['count'] += 1
        total += value
        valid += 1
result_groups = [
    {'label': label, 'value': g['sum'] / g['count'] if spec['aggregation'] == 'mean' else g['sum'], 'count': g['count']}
    for label, g in groups.items()
]
result_groups.sort(key=lambda g: (-g['value'], g['label']))
result = {
    'rowCount': len(rows),
    'missingCells': sum(1 for row in rows for value in row if not value.strip()),
    'duplicateRows': len(rows) - len(set(tuple(row) for row in rows)),
    'groups': result_groups,
    'total': total / valid if spec['aggregation'] == 'mean' and valid else total,
    'validValues': valid,
}
print('${RESULT_MARKER}' + json.dumps(result, ensure_ascii=False, allow_nan=False))
`
  return {
    commentary: 'Read the approved CSV, compute the specified aggregation and return structured values for independent verification.',
    template: 'code-interpreter-v1',
    title: spec.title,
    description: 'A constrained, reproducible CSV analysis.',
    additional_dependencies: [],
    has_additional_dependencies: false,
    install_dependencies_command: '',
    port: null,
    file_path: 'analysis.py',
    code,
  }
}
