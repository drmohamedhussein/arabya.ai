#!/usr/bin/env python3
from pathlib import Path

js_path = Path('/workspace/app.js')
text = js_path.read_text(encoding='utf-8')

helper = r'''
function buildResultIndexMap(sourceList) {
  const indexMap = new Map();
  (sourceList || []).forEach((res, index) => indexMap.set(res, index));
  return indexMap;
}

function sortResultsByRecency(results, sourceList) {
  const list = Array.isArray(results) ? [...results] : [];
  const base = Array.isArray(sourceList) ? sourceList : (systemState.results || []);
  const indexMap = buildResultIndexMap(base);
  return list.sort((a, b) => compareResultsByRecency(a, b, indexMap));
}

'''

if 'function sortResultsByRecency' not in text:
    anchor = 'function compareResultsByRecency(a, b, indexMap) {'
    end = '''  return (indexMap.get(b) ?? 0) - (indexMap.get(a) ?? 0);
}

function refreshTeacherDashboardViews(options = {}) {'''
    if anchor not in text or end not in text:
        raise SystemExit('compareResultsByRecency anchor missing')
    text = text.replace(
        end,
        '''  return (indexMap.get(b) ?? 0) - (indexMap.get(a) ?? 0);
}

''' + helper + '''function refreshTeacherDashboardViews(options = {}) {''',
        1
    )

recent_old = '''  const resultIndexMap = new Map();
  results.forEach((res, index) => resultIndexMap.set(res, index));
  const recentResults = [...results]
    .sort((a, b) => compareResultsByRecency(a, b, resultIndexMap))
    .slice(0, 8);'''

recent_new = '''  const recentResults = sortResultsByRecency(results, systemState.results).slice(0, 8);'''

if recent_old in text:
    text = text.replace(recent_old, recent_new, 1)

render_old = '  const sorted = [...systemState.results].reverse();'
render_new = '  const sorted = sortResultsByRecency(systemState.results);'
if render_old in text:
    text = text.replace(render_old, render_new, 1)
else:
    raise SystemExit('renderStudentResultsTable sort missing')

csv_old = '  const exportRows = filterResultsForTeacherTable([...systemState.results].reverse());'
csv_new = '  const exportRows = filterResultsForTeacherTable(sortResultsByRecency(systemState.results));'
if csv_old in text:
    text = text.replace(csv_old, csv_new, 1)

text = text.replace('const ARABYA_APP_VERSION = "2026.05.31.4";', 'const ARABYA_APP_VERSION = "2026.05.31.5";', 1)
js_path.write_text(text, encoding='utf-8')

html_path = Path('/workspace/index.html')
html_path.write_text(html_path.read_text(encoding='utf-8').replace('2026.05.31.4', '2026.05.31.5'), encoding='utf-8')
print('patched results tab sort')
