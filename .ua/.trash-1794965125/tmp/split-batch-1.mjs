import fs from 'node:fs';

const graph = JSON.parse(fs.readFileSync('.ua/intermediate/batch-1.json', 'utf8'));
const batches = JSON.parse(fs.readFileSync('.ua/intermediate/batches.json', 'utf8'));
const batch = batches.batches[0];
const files = new Map();
for (const node of graph.nodes) {
  const filePath = node.filePath;
  if (!files.has(filePath)) files.set(filePath, []);
  files.get(filePath).push(node);
}
const paths = [...files.keys()].sort((a, b) => a.localeCompare(b));
const size = Math.ceil(paths.length / 2);
const imports = new Set(Object.values(batch.batchImportData).flat());
for (let partIndex = 0; partIndex < 2; partIndex += 1) {
  const partPaths = paths.slice(partIndex * size, (partIndex + 1) * size);
  const nodes = partPaths.flatMap((path) => files.get(path));
  const ids = new Set(nodes.map((node) => node.id));
  // Keep source-owned edges; merge-batch-graphs adds path-based tested_by edges.
  const edges = graph.edges.filter((edge) => edge.type !== 'tested_by' && ids.has(edge.source));
  for (const edge of edges) {
    if (ids.has(edge.target)) continue;
    const targetFile = edge.target.startsWith('file:') ? edge.target.slice(5) : '';
    if (targetFile && imports.has(targetFile)) continue;
    throw new Error(`Part ${partIndex + 1} has an unresolved external edge: ${edge.source} -> ${edge.target}`);
  }
  fs.writeFileSync(`.ua/intermediate/batch-1-part-${partIndex + 1}.json`, JSON.stringify({ nodes, edges }, null, 2));
  console.log(`part ${partIndex + 1}: ${nodes.length} nodes, ${edges.length} edges`);
}
