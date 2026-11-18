const fs = require('fs');
const path = require('path');
const root = process.cwd();
const dir = path.join(root, '.ua', 'intermediate');
const graph = JSON.parse(fs.readFileSync(path.join(dir, 'assembled-graph.json'), 'utf8'));
const scan = JSON.parse(fs.readFileSync(path.join(dir, 'scan-result.json'), 'utf8'));
const rawLayers = JSON.parse(fs.readFileSync(path.join(dir, 'layers.json'), 'utf8'));
const rawTour = JSON.parse(fs.readFileSync(path.join(dir, 'tour.normalized.json'), 'utf8'));
const known = new Set(graph.nodes.map(n => n.id));
const prefixes = ['file:','config:','document:','service:','pipeline:','table:','schema:','resource:','endpoint:'];
let layers = Array.isArray(rawLayers) ? rawLayers : (Array.isArray(rawLayers.layers) ? rawLayers.layers : []);
layers = layers.map((layer, i) => {
  let ids = layer.nodeIds ?? layer.nodes ?? [];
  if (!Array.isArray(ids)) ids = [];
  ids = ids.map(x => typeof x === 'string' ? x : (x && typeof x.id === 'string' ? x.id : '')).filter(Boolean).map(x => prefixes.some(p => x.startsWith(p)) ? x : `file:${x.replaceAll('\\\\','/')}`).filter(x => known.has(x));
  const name = String(layer.name || `Camada ${i + 1}`);
  const id = layer.id || `layer:${name.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}`;
  return { id, name, description: String(layer.description || 'Camada arquitetural do projeto.'), nodeIds: ids };
});
const tour = rawTour.map((step, i) => ({ order: Number.isInteger(step.order) ? step.order : i + 1, title: String(step.title || `Etapa ${i + 1}`), description: String(step.description || ''), nodeIds: (Array.isArray(step.nodeIds) ? step.nodeIds : []).filter(id => known.has(id)), ...(typeof step.languageLesson === 'string' ? {languageLesson: step.languageLesson} : {}) }));
const project = {
  name: scan.name || 'rpg-tooling', languages: scan.languages || [], frameworks: scan.frameworks || [], description: scan.description || '',
  analyzedAt: new Date().toISOString(), gitCommitHash: '2430ef737a9202e53bf237a5b45a2e4db05ccd41'
};
const full = { version:'1.0.0', project, nodes:graph.nodes, edges:graph.edges, layers, tour };
fs.writeFileSync(path.join(dir, 'assembled-graph.json'), JSON.stringify(full, null, 2), 'utf8');
const fileTypes = new Set(['file','config','document','service','pipeline','table','schema','resource','endpoint']);
const assigned = layers.flatMap(l => l.nodeIds);
const summary = { project: project.name, nodes:full.nodes.length, edges:full.edges.length, layers:layers.length, tourSteps:tour.length, assignedFileNodes:assigned.length, uniqueAssignedFileNodes:new Set(assigned).size, fileNodes:full.nodes.filter(n=>fileTypes.has(n.type)).length, danglingLayers:layers.flatMap(l=>l.nodeIds.filter(id=>!known.has(id))).length, danglingTour:tour.flatMap(s=>s.nodeIds.filter(id=>!known.has(id))).length };
console.log(JSON.stringify(summary,null,2));
