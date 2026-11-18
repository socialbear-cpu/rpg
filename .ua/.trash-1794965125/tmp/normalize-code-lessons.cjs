const fs = require('fs');
const path = require('path');
const root = process.cwd();
const dir = path.join(root, '.ua', 'intermediate');
const graph = JSON.parse(fs.readFileSync(path.join(dir, 'assembled-graph.json'), 'utf8'));
const tour = JSON.parse(fs.readFileSync(path.join(dir, 'tour.normalized.json'), 'utf8'));
const fileTypes = new Set(['file','config','document','service','pipeline','table','schema','resource','endpoint']);
const byPath = new Map();
for (const n of graph.nodes) {
  if (!fileTypes.has(n.type) || !n.filePath) continue;
  const p = n.filePath.replaceAll('\\\\', '/');
  if (!byPath.has(p)) byPath.set(p, n);
}
const detailed = new Set();
let files = {};
const warnings = [];
const batches = fs.readdirSync(dir).filter(n => n.startsWith('code-lessons.detailed.') && n.endsWith('.json')).sort((a,b) => Number(a.match(/\\.(\\d+)\\.json$/)?.[1] || 0) - Number(b.match(/\\.(\\d+)\\.json$/)?.[1] || 0));
for (const name of batches) {
  const doc = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
  const current = doc.files && typeof doc.files === 'object' ? doc.files : doc;
  for (const [key, value] of Object.entries(current)) {
    if (key === 'version' || key === 'generatedAt') continue;
    if (Object.hasOwn(files, key)) { warnings.push(`Duplicate detailed lesson key kept first: ${key}`); continue; }
    files[key] = value;
    detailed.add(key);
  }
}
for (const key of Object.keys(files)) if (!byPath.has(key)) delete files[key];
for (const key of [...detailed]) if (!byPath.has(key)) detailed.delete(key);
const validOrders = new Set(tour.map(s => s.order));
for (const [key, entry] of Object.entries(files)) {
  const sections = Array.isArray(entry.sections) ? entry.sections : [];
  entry.sections = sections.filter(s => Array.isArray(s.lineRange) && s.lineRange.length === 2 && s.lineRange.every(Number.isInteger) && s.lineRange[0] >= 1 && s.lineRange[1] >= s.lineRange[0]).slice(0, 10);
  if (entry.tourOrder !== undefined && !validOrders.has(entry.tourOrder)) delete entry.tourOrder;
  if (typeof entry.overview !== 'string' || !entry.overview.trim()) entry.overview = byPath.get(key)?.summary || 'Sem resumo disponível.';
}
for (const [key, node] of byPath) if (!Object.hasOwn(files, key)) files[key] = { overview: node.summary || 'Sem resumo disponível.', sections: [] };
const out = { version: 1, generatedAt: new Date().toISOString(), files };
fs.writeFileSync(path.join(dir, 'code-lessons.normalized.json'), JSON.stringify(out, null, 2), 'utf8');
const result = { batches: batches.length, detailedFiles: detailed.size, totalFiles: Object.keys(files).length, overviewOnly: Object.values(files).filter(v => !v.sections.length).length, warnings, invalidSectionCounts: Object.values(files).reduce((n,v) => n + (Array.isArray(v.sections) ? 0 : 1), 0) };
console.log(JSON.stringify(result, null, 2));
