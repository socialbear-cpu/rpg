const fs=require('fs'), path=require('path');
const root=process.cwd(), ua=path.join(root,'.ua'), batch=JSON.parse(fs.readFileSync(path.join(ua,'intermediate/batches.json'),'utf8')).batches[8], extracted=JSON.parse(fs.readFileSync(path.join(ua,'tmp/ua-file-extract-results-9.json'),'utf8'));
const descriptions={
'001_initial_schema.sql':'Cria o esquema relacional inicial da aplicação: contas, perfis, sistemas de jogo, personagens, inventário, loja e conversas.',
'002_character_fields.sql':'Ajusta o modelo de personagem, renomeando campos e removendo a tabela legada de informações do personagem.',
'003_supabase_auth.sql':'Integra os usuários existentes ao Supabase Auth e remove o armazenamento local de credenciais.',
'004_profile_rls.sql':'Ativa Row Level Security e limita leitura e atualização de perfis ao próprio usuário.',
'005_daily_login_rewards.sql':'Introduz recompensas e resgates diários por sistema, com registros para auditoria e políticas de acesso.',
'006_user_hierarchy.sql':'Cria administradores da plataforma e associa membros aos sistemas com papéis e funções de autorização.',
'007_system_hierarchy_rls.sql':'Aplica políticas de segurança por propriedade, associação e papel às principais entidades do jogo.',
'008_daily_login_popup.sql':'Registra a visualização do aviso de login diário por usuário.',
'009_notifications.sql':'Cria notificações e funções seguras para leitura, anúncios e moderação de sistemas.',
'010_daily_login_popup_per_system.sql':'Move o controle do aviso diário para o escopo de cada sistema de jogo.',
'011_character_experience.sql':'Modela fontes de experiência, configurações por sistema e o histórico de XP dos personagens.',
'012_character_item_trading.sql':'Adiciona ofertas de troca entre personagens e linhas de itens, com índices para consulta e concorrência.',
'013_system_character_sheets.sql':'Permite que cada sistema defina e persista fichas de personagem próprias.',
'014_profile_usernames.sql':'Adiciona usernames únicos aos perfis e um índice case-insensitive para evitar duplicidade.',
'015_visual_character_sheet.sql':'Expande o modelo visual das fichas de personagem e seus dados configuráveis.',
'016_character_sheet_visual_elements.sql':'Adiciona elementos visuais estruturados às fichas personalizadas.',
'017_character_sheet_choices_and_conditions.sql':'Adiciona opções e condições para controlar campos e escolhas nas fichas de personagem.',
'018_system_store_economy.sql':'Introduz moeda por sistema e lançamentos de saldo para as transações da loja.',
'019_system_member_character_search.sql':'Ajusta funções e permissões para permitir busca de personagens por membros do sistema.',
'020_game_system_visibility_password.sql':'Armazena controles de visibilidade e acesso por senha nos sistemas de jogo.',
'021_fix_daily_login_inventory_upsert.sql':'Corrige a atualização atômica de itens recebidos por resgates de login diário.',
'021_system_password_access_enforcement.sql':'Reforça a verificação de senha e as políticas de acesso para sistemas protegidos.',
'022_system_discovery_metadata.sql':'Adiciona metadados de descoberta e tags pesquisáveis aos sistemas de jogo.',
'023_system_lifecycle.sql':'Centraliza operações de ciclo de vida do sistema em funções transacionais e protegidas.',
'024_fix_system_tag_labels.sql':'Corrige a normalização e os rótulos de tags dos sistemas de jogo.',
'025_require_email_confirmation_for_system_deletion.sql':'Exige confirmação por email antes de concluir a exclusão de um sistema.',
'026_atomic_system_store_update.sql':'Torna atômicas as alterações de configurações e catálogo da loja de um sistema.',
'027_system_events.sql':'Cria eventos de sistema com horários e índices para listagem cronológica.',
'028_campaign_chat_room_authorization.sql':'Atualiza regras de autorização das salas de campanha e conversas.',
'029_lobby_creator_tools.sql':'Adiciona configurações e suporte de dados para ferramentas do criador no lobby.',
'030_store_item_images.sql':'Ajusta permissões e referências de imagens dos itens da loja.',
'031_store_currency_and_offer_autosave.sql':'Atualiza políticas e funções para moeda e salvamento automático de ofertas.',
'032_chats_as_game_space.sql':'Converte campanhas em chats como espaço central do jogo e migra membros, mensagens e permissões.',
'033_store_currency_image_permissions.sql':'Ajusta permissões de imagens ligadas à moeda da loja.',
'034_daily_login_per_character.sql':'Torna os resgates diários específicos por personagem e atualiza a função de consulta.',
'035_account_settings.sql':'Adiciona solicitações de transferência de propriedade de sistemas e configurações de conta.',
'035_friendships.sql':'Cria pedidos de amizade com estados e índices para consultas por participante.',
'036_profile_customization.sql':'Adiciona atualização controlada de preferências e campos do perfil do usuário.',
'036_rpg_invitations.sql':'Implementa convites para sistemas e conversas, busca social e operações de amizade.',
'037_allow_profile_timestamp_updates.sql':'Permite que a função de proteção de perfil aceite atualizações de timestamps.',
'037_public_player_profiles.sql':'Cria comentários em perfis públicos e mensagens diretas, com funções de leitura e envio.',
'038_username_change_once.sql':'Impede alterações repetidas do username depois da mudança inicial.'
};
const operations=new Map(), creators=new Map();
for(const f of batch.files){ const content=fs.readFileSync(path.join(root,f.path),'utf8'); const names=new Set(), kinds=new Map();
 const add=(raw,kind)=>{if(!raw)return; const name=raw.replace(/^\"|\"$/g,'').split('.').pop().replace(/[\";]/g,''); if(!name)return; names.add(name); if(!kinds.has(name)||kind==='create') kinds.set(name,kind);};
 for(const line of content.split(/\r?\n/)){
  let m;
  if((m=line.match(/^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[\w\"]+\.)?([\w\"]+)/i))) {add(m[1],'create'); const nm=m[1].replace(/\"/g,''); if(!creators.has(nm)) creators.set(nm,f.path);}
  else if((m=line.match(/^\s*ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:[\w\"]+\.)?([\w\"]+)/i))) add(m[1],'alter');
  else if((m=line.match(/^\s*DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:[\w\"]+\.)?([\w\"]+)/i))) add(m[1],'drop');
  else if((m=line.match(/^\s*CREATE\s+POLICY\s+.+?\s+ON\s+(?:[\w\"]+\.)?([\w\"]+)/i))) add(m[1],'policy');
  else if((m=line.match(/^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?[\w\"]+\s+ON\s+(?:ONLY\s+)?(?:[\w\"]+\.)?([\w\"]+)/i))) add(m[1],'index');
 }
 if(!names.size) names.add('migration');
 operations.set(f.path,[...names].map(n=>({name:n,kind:kinds.get(n)||'migration'})));
}
const info=new Map(extracted.results.map(x=>[x.path,x])); const nodes=[],edges=[];
for(const f of batch.files){const base=path.basename(f.path), ops=operations.get(f.path), desc=descriptions[base]||'Atualiza estruturas e regras do banco de dados relacionadas a '+base.replace(/^\d+_/,'').replace(/\.sql$/,'').replace(/_/g,' ')+'.';
 for(const op of ops){ const id='table:'+f.path+':'+op.name; const row=info.get(f.path); const nonempty=row?.nonEmptyLines||0; const complexity=nonempty>200?'complex':nonempty>=50?'moderate':'simple'; const isMigrationAnchor=op.name==='migration'; const summary=isMigrationAnchor?desc:`${desc} A alteração se aplica à tabela ${op.name}.`;
  nodes.push({id,type:'table',name:isMigrationAnchor?base.replace(/\.sql$/,''):op.name,filePath:f.path,summary,tags:['database','migration','schema'],complexity});
 }
}
// Link modified table versions to the original in-batch CREATE TABLE definition when both partitions will share a file group.
const partCount=Math.ceil(Math.max(nodes.length/60,edges.length/120)); const sorted=[...batch.files].sort((a,b)=>a.path.localeCompare(b.path)); const groupSize=Math.ceil(sorted.length/partCount); const partOf=new Map(sorted.map((f,i)=>[f.path,Math.floor(i/groupSize)+1]));
for(const f of batch.files){for(const op of operations.get(f.path)){const creator=creators.get(op.name); if(creator && creator!==f.path && partOf.get(creator)===partOf.get(f.path)) edges.push({source:'table:'+f.path+':'+op.name,target:'table:'+creator+':'+op.name,type:'migrates',direction:'forward',weight:0.7});}}
const nPer=Math.ceil(sorted.length/partCount);
for(let i=0;i<partCount;i++){const filePaths=new Set(sorted.slice(i*nPer,(i+1)*nPer).map(f=>f.path)); const ns=nodes.filter(n=>filePaths.has(n.filePath)); const ids=new Set(ns.map(n=>n.id)); const es=edges.filter(e=>ids.has(e.source)&&ids.has(e.target)); const out=path.join(ua,'intermediate',`batch-9-part-${i+1}.json`); fs.writeFileSync(out,JSON.stringify({nodes:ns,edges:es},null,2)); JSON.parse(fs.readFileSync(out,'utf8')); console.log(`${path.basename(out)} nodes=${ns.length} edges=${es.length}`);}
console.log(`total files=${batch.files.length} nodes=${nodes.length} edges=${edges.length} skipped=${extracted.filesSkipped.length}`);
