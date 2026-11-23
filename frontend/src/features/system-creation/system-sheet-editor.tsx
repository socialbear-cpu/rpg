'use client';

import { useEffect, useState } from 'react';
import { getCharacterSheet, updateGameSystemCharacterSheet, type CharacterSheetDefinition } from '../../api';
import { isCharacterSheetDefinitionValid } from './sheet-model';
import { CharacterSheetBuilder } from './character-sheet-builder';
import { normalizeSingleVisualComposition } from '../character-sheet/composition';

function getImageValidationError(definition: CharacterSheetDefinition): string | null {
  for (const step of definition.steps) {
    for (const component of step.components) {
      if (component.type !== 'visual_composition') continue;
      const hasVisualElement = (step.elements ?? []).some((element) => (element.composition_key ?? 'composition_1') === component.composition_key);
      if (!hasVisualElement) {
        return `A composição visual “${component.label}” precisa ter pelo menos um texto ou uma imagem no canvas. Use “+ Texto” ou “+ Imagem”.`;
      }
    }
    for (const element of step.elements ?? []) {
      if (element.type !== 'image') continue;
      try {
        if (element.image_url.length > 2048 || new URL(element.image_url).protocol !== 'https:') throw new Error();
      } catch {
        return `Confira a URL HTTPS da imagem na etapa “${step.label}”. URLs precisam começar com https:// e ter até 2048 caracteres.`;
      }
    }
    for (const component of step.components) {
      if (component.type !== 'single_select') continue;
      for (const option of component.options) {
        if (!option.image_url) continue;
        try {
          if (option.image_url.length > 2048 || new URL(option.image_url).protocol !== 'https:') throw new Error();
        } catch {
          return `Confira a URL HTTPS da imagem da opção “${option.label}” na etapa “${step.label}”. URLs precisam começar com https:// e ter até 2048 caracteres.`;
        }
      }
    }
  }
  return null;
}

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
    const singlePageDefinition = definition && {
      ...definition,
      layout_mode: 'single_page' as const,
      steps: definition.steps.map(normalizeSingleVisualComposition),
    };
    if (!singlePageDefinition || !isCharacterSheetDefinitionValid(singlePageDefinition)) {
      setError(singlePageDefinition
        ? getImageValidationError(singlePageDefinition) ?? 'Não foi possível validar a ficha. Confira se todos os campos e opções têm nomes preenchidos e sem duplicatas, e se os elementos visuais estão dentro dos limites do canvas.'
        : 'A ficha ainda está carregando. Tente novamente em instantes.');
      setSaved(false);
      return;
    }
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await updateGameSystemCharacterSheet(systemId, singlePageDefinition);
      setDefinition(singlePageDefinition);
      setSaved(true);
      onSaved?.();
    } catch (saveError) {
      setError(saveError instanceof Error
        ? `Falha ao salvar a ficha: ${saveError.message}`
        : 'Falha ao salvar a ficha. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="system-sheet-editor">
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
