'use client';

import { useEffect, useState } from 'react';
import { getCharacterSheet, updateGameSystemCharacterSheet, type CharacterSheetDefinition } from '../../api';
import { isCharacterSheetDefinitionValid } from './sheet-model';
import { CharacterSheetBuilder } from './character-sheet-builder';

interface SystemSheetEditorProps {
  systemId: string;
  systemName: string;
  onCancel?: () => void;
  onSaved?: () => void;
}

export function SystemSheetEditor({ systemId, systemName, onCancel, onSaved }: SystemSheetEditorProps) {
  const [definition, setDefinition] = useState<CharacterSheetDefinition | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDefinition(null);
    setError('');
    void getCharacterSheet(systemId)
      .then((sheet) => { if (!cancelled) setDefinition(sheet.definition); })
      .catch(() => { if (!cancelled) setError('Não foi possível carregar a ficha deste sistema.'); });
    return () => { cancelled = true; };
  }, [systemId]);

  async function save() {
    if (!definition || !isCharacterSheetDefinitionValid(definition)) {
      setError('Revise as etapas, campos e opções antes de salvar.');
      setSaved(false);
      return;
    }
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await updateGameSystemCharacterSheet(systemId, definition);
      setSaved(true);
      onSaved?.();
    } catch {
      setError('Não foi possível salvar. Confirme se você é proprietário deste sistema.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="system-sheet-editor">
    <span className="sheet-builder-eyebrow">{systemName}</span>
    <h3>Editar ficha de personagem</h3>
    {definition ? <>
      <CharacterSheetBuilder definition={definition} onChange={(next) => { setDefinition(next); setSaved(false); }} />
      <div className="system-creation-actions">
        {onCancel && <button type="button" className="secondary-button" onClick={onCancel}>Cancelar</button>}
        <button type="button" className="primary-button" disabled={saving} onClick={() => void save()}>{saving ? 'Salvando...' : 'Salvar ficha'}</button>
      </div>
    </> : !error && <p role="status">Carregando ficha...</p>}
    {error && <p className="systems-error" role="alert">{error}</p>}
    {saved && <p className="system-sheet-saved" role="status">Ficha salva com sucesso.</p>}
  </div>;
}
