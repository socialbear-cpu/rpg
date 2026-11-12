'use client';

import { useEffect, useState } from 'react';
import { createSystemCharacter, getCharacterSheet, getGameSystems, getSystemCharacters, type CharacterSheetField, type GameSystem, type SystemCharacter } from '../../api';
import { CharacterForm } from './character-form';
import { CharacterGallery } from './character-gallery';
import { AppHeader } from '../shell/app-header';
import './characters.css';

export function CharacterEntry({ systemId, push }: { systemId: string; push: (path: string) => void }) {
  const [system, setSystem] = useState<GameSystem | null>(null);
  const [fields, setFields] = useState<CharacterSheetField[]>([]);
  const [characters, setCharacters] = useState<SystemCharacter[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getGameSystems(), getCharacterSheet(systemId), getSystemCharacters(systemId)])
      .then(([systemsResult, sheet, characterResult]) => {
        if (cancelled) return;
        const activeSystem = systemsResult.systems.find((item) => item.id === systemId);
        if (!activeSystem) throw new Error('SYSTEM_UNAVAILABLE');
        setSystem(activeSystem);
        setFields(sheet.fields);
        setCharacters(characterResult.characters.filter((character) => character.status === 'active' && character.game_system_id === systemId));
      })
      .catch(() => { if (!cancelled) setError('Não foi possível abrir este sistema.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [systemId]);

  async function createCharacter(characterName: string, attributes: Record<string, unknown>) {
    setError(null);
    setSaving(true);
    try {
      const { character } = await createSystemCharacter(systemId, { character_name: characterName, attributes });
      setCharacters((current) => [...current, character]);
      setSelectedCharacterId(character.id);
      setCreating(false);
      setSaving(false);
    } catch {
      setError('Não foi possível criar o personagem. Confira os campos e tente novamente.');
      setSaving(false);
    }
  }

  if (loading) return <main className="character-entry-page"><AppHeader activeItem="Meus Sistemas" /><p role="status">Carregando sistema...</p></main>;
  if (error && !system) return <main className="character-entry-page"><AppHeader activeItem="Meus Sistemas" backHref="/dashboard" backLabel="Voltar ao dashboard" /><p role="alert">{error}</p></main>;
  if (!system) return null;
  if (creating) return <main className="character-entry-page"><AppHeader activeItem="Meus Sistemas"><button className="app-header-back" type="button" onClick={() => setCreating(false)}>← Voltar aos personagens</button></AppHeader><header className="character-entry-heading"><span className="character-entry-eyebrow">{system.name}</span><h1>Crie seu personagem</h1></header><CharacterForm fields={fields} error={error} saving={saving} onSubmit={(name, attributes) => void createCharacter(name, attributes)} onCancel={() => setCreating(false)} /></main>;
  return <CharacterGallery systemName={system.name} fields={fields} characters={characters} selectedCharacterId={selectedCharacterId} onCreate={() => { setError(null); setCreating(true); }} onEnter={(characterId) => push(`/systems/${encodeURIComponent(systemId)}/home/${encodeURIComponent(characterId)}`)} />;
}
