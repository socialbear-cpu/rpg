const fs=require('fs');
const {fileNodes}=JSON.parse(fs.readFileSync('.ua/tmp/architecture-input.json','utf8'));
const buckets={backend:[],frontend:[],data:[],tests:[],config:[],docs:[],prototypes:[],shared:[]};
function bucket(n){const p=(n.filePath||'').replace(/\\/g,'/').toLowerCase();const name=p.split('/').pop()||p;
 if(/(^|\/)(test|tests|__tests__|spec|specs)(\/|$)/.test(p)||/\.(test|spec)\./.test(p)||/(^|\/)test_[^/]+\.py$/.test(p)||(/(^|\/)\w+_test\.(go|rs|sql)$/.test(p)))return 'tests';
 if(n.type==='document'||/\.(md|rst|txt)$/.test(name)||p.endsWith('/readme'))return 'docs';
 if(p.startsWith('backend/src/'))return 'backend';
 if(p.startsWith('frontend/')){
  if(n.type==='config'||/^(package\.json|tsconfig[^/]*\.json|next\.config\.[^/]+|config\.js)$/.test(name))return 'config';
  return 'frontend';
 }
 if(p.startsWith('database/')||p.startsWith('supabase/'))return 'data';
 if(p.startsWith('.superpowers/'))return 'prototypes';
 if(n.type==='config'||/^(package\.json|vercel\.json|\.gitignore|config\.toml|\.understandignore)$/.test(name)||p.startsWith('.ua/'))return 'config';
 if(p.startsWith('backend/'))return 'backend';
 return 'shared';
}
for(const n of fileNodes)buckets[bucket(n)].push(n.id);
const defs=[
 {key:'backend',id:'layer:backend-api',name:'Backend e API',description:'Implementa autenticação, rotas Fastify, regras de domínio, acesso a dados e integração da API com o Supabase.'},
 {key:'frontend',id:'layer:frontend-web',name:'Aplicação web',description:'Reúne as rotas, telas, componentes, estilos e integrações do cliente Next.js e React.'},
 {key:'data',id:'layer:data-supabase',name:'Banco de dados e Supabase',description:'Define o esquema relacional, migrações, políticas de segurança, funções e recursos de autenticação do Supabase.'},
 {key:'tests',id:'layer:tests',name:'Testes e validação',description:'Verifica os contratos da API e da interface, as regras de banco de dados e os cenários de integração.'},
 {key:'config',id:'layer:configuration',name:'Configuração e implantação',description:'Centraliza manifestos dos workspaces, opções de build e configurações de execução e implantação.'},
 {key:'docs',id:'layer:documentation',name:'Documentação',description:'Explica a arquitetura, autenticação, estrutura do banco de dados e orientações de desenvolvimento do projeto.'},
 {key:'prototypes',id:'layer:design-prototypes',name:'Protótipos de interface',description:'Guarda explorações visuais e protótipos HTML usados para avaliar diferentes experiências e apresentações do RPG.'},
 {key:'shared',id:'layer:shared-project-files',name:'Arquivos compartilhados',description:'Agrupa arquivos de suporte do repositório que não pertencem diretamente a um workspace ou camada específica.'}
];
const layers=defs.filter(d=>buckets[d.key].length).map(d=>({id:d.id,name:d.name,description:d.description,nodeIds:buckets[d.key]}));
const all=layers.flatMap(l=>l.nodeIds), counts=new Map();for(const id of all)counts.set(id,(counts.get(id)||0)+1);
const missing=fileNodes.filter(n=>!counts.has(n.id)).map(n=>n.id),duplicate=[...counts].filter(([,v])=>v!==1).map(([id])=>id),unknown=Object.entries(buckets.shared).map(x=>x[1]);
if(missing.length||duplicate.length||all.length!==fileNodes.length)throw new Error(JSON.stringify({fileNodes:fileNodes.length,assigned:all.length,missing,duplicate}));
fs.writeFileSync('.ua/intermediate/layers.json',JSON.stringify(layers,null,2));
console.log(JSON.stringify({fileNodes:fileNodes.length,layers:layers.map(l=>({name:l.name,count:l.nodeIds.length})),total:all.length,unknown:buckets.shared},null,2));
