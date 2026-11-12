'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCharacterSheet, getGameSystems, updateGameSystemCharacterSheet, type CharacterSheetDefinition, type GameSystem } from '../../api';
import { isCharacterSheetDefinitionValid } from './sheet-model';
import { CharacterSheetBuilder } from './character-sheet-builder';
import { AppHeader } from '../shell/app-header';
import './system-creation.css';

export function SystemSheetEditorPage({ systemId }: { systemId: string }) {
  const router=useRouter(); const [system,setSystem]=useState<GameSystem|null>(null); const [definition,setDefinition]=useState<CharacterSheetDefinition|null>(null); const [error,setError]=useState(''); const [saving,setSaving]=useState(false);
  useEffect(()=>{let cancelled=false;Promise.all([getGameSystems(),getCharacterSheet(systemId)]).then(([systems,sheet])=>{if(cancelled)return;setSystem(systems.systems.find(s=>s.id===systemId)??null);setDefinition(sheet.definition)}).catch(()=>{if(!cancelled)setError('Não foi possível carregar a ficha deste sistema.')});return()=>{cancelled=true}},[systemId]);
  async function save(){if(!definition||!isCharacterSheetDefinitionValid(definition)){setError('Revise as etapas, campos, opções e elementos visuais (incluindo URLs HTTPS) antes de salvar.');return}setSaving(true);setError('');try{await updateGameSystemCharacterSheet(systemId,definition);router.push('/dashboard')}catch(error){setError(error instanceof Error?error.message:'Não foi possível salvar a ficha.')}finally{setSaving(false)}}
  return <main className="system-creation-page"><AppHeader activeItem="Meus sistemas" backHref="/dashboard" backLabel="Voltar ao dashboard"/><div className="system-creation-panel system-creation-sheet-panel"><span className="sheet-builder-eyebrow">{system?.name??'SISTEMA'}</span><h1>Editar ficha de personagem</h1>{definition?<><CharacterSheetBuilder definition={definition} onChange={setDefinition}/><div className="system-creation-actions"><button type="button" className="secondary-button" onClick={()=>router.back()}>Cancelar</button><button type="button" className="primary-button" disabled={saving} onClick={()=>void save()}>{saving?'Salvando...':'Salvar ficha'}</button></div></>:!error&&<p role="status">Carregando ficha...</p>}{error&&<p className="systems-error" role="alert">{error}</p>}</div></main>;
}
