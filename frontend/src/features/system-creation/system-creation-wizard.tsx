'use client';

import { useState, type FormEvent } from 'react';
import type { CharacterSheetDefinition, CreateGameSystemInput, GameSystem } from '../../api';
import { CharacterSheetBuilder } from './character-sheet-builder';
import { AppHeader } from '../shell/app-header';
import { createDefaultCharacterSheetDefinition, isCharacterSheetDefinitionValid } from './sheet-model';
import './system-creation.css';

interface SystemCreationWizardProps {
  createSystem: (input: CreateGameSystemInput) => Promise<{ system: GameSystem; definition: CharacterSheetDefinition }>;
  push: (path: string) => void;
}

export function SystemCreationWizard({ createSystem, push }: SystemCreationWizardProps) {
  const [step, setStep] = useState<'details' | 'sheet'>('details');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [definition, setDefinition] = useState<CharacterSheetDefinition>(createDefaultCharacterSheetDefinition);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function continueToSheet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setStep('sheet');
  }

  async function submitSystem() {
    setError(null);
    if (!isCharacterSheetDefinitionValid(definition)) {
      setError('Revise as etapas, campos, opções e elementos visuais (incluindo URLs HTTPS) antes de continuar.');
      return;
    }
    setSaving(true);
    try {
      const { system } = await createSystem({ name: name.trim(), description: description.trim() || null, definition });
      push(`/systems/${encodeURIComponent(system.id)}/characters`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Não foi possível criar o sistema. Tente novamente.');
      setSaving(false);
    }
  }

  return (
    <main className="system-creation-page">
      <AppHeader activeItem="Explorar sistemas" backHref="/dashboard" backLabel="Voltar ao dashboard" />
      <div className="system-creation-progress"><span>ETAPA {step === 'details' ? '1' : '2'} DE 2</span><span>{step === 'details' ? 'Detalhes do sistema' : 'Ficha do personagem'}</span></div>
      {step === 'details' ? (
        <form className="system-creation-panel" onSubmit={continueToSheet}>
          <span className="sheet-builder-eyebrow">NOVO SISTEMA</span>
          <h1>Crie um mundo para jogar</h1>
          <p>Defina o nome do sistema e, em seguida, os campos da ficha de personagem.</p>
          <label className="system-creation-label">Nome do sistema
            <input autoFocus required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Crônicas de Aether" />
          </label>
          <label className="system-creation-label">Descrição <span>(opcional)</span>
            <textarea maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Conte um pouco sobre este universo" rows={4} />
          </label>
          <button type="submit" className="primary-button" disabled={!name.trim()}>Continuar para ficha →</button>
        </form>
      ) : (
        <div className="system-creation-panel system-creation-sheet-panel">
          <div className="system-creation-title"><span className="sheet-builder-eyebrow">{name.trim()}</span><h1>Como são os personagens?</h1><p>Adicione os campos usados pela ficha deste sistema.</p></div>
          <CharacterSheetBuilder definition={definition} onChange={setDefinition} />
          {error && <p className="systems-error" role="alert">{error}</p>}
          <div className="system-creation-actions">
            <button type="button" className="secondary-button" onClick={() => setStep('details')}>Voltar</button>
            <button type="button" className="primary-button" disabled={saving} onClick={() => void submitSystem()}>{saving ? 'Criando sistema...' : 'Criar sistema'}</button>
          </div>
        </div>
      )}
    </main>
  );
}
