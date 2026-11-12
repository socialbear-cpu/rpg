'use client';

import { useEffect, useState } from 'react';
import { getCharacterSheet, getGameSystems, getSystemCharacters, type CharacterSheetField, type GameSystem, type SystemCharacter } from '../../api';
import { CharacterHome } from './character-home';
import { AppHeader } from '../shell/app-header';

export function CharacterHomePage({ systemId, characterId, push }: { systemId: string; characterId: string; push: (path: string) => void }) {
  const [system, setSystem] = useState<GameSystem | null>(null);
  const [character, setCharacter] = useState<SystemCharacter | null>(null);
  const [fields, setFields] = useState<CharacterSheetField[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getGameSystems(), getCharacterSheet(systemId), getSystemCharacters(systemId)])
      .then(([systemsResult, sheet, characterResult]) => {
        if (cancelled) return;
        setSystem(systemsResult.systems.find((item) => item.id === systemId) ?? null);
        setFields(sheet.fields);
        setCharacter(characterResult.characters.find((item) => item.id === characterId && item.game_system_id === systemId && item.status === 'active') ?? null);
      })
      .catch(() => { if (!cancelled) { setSystem(null); setCharacter(null); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [systemId, characterId]);

  if (loading) return <main className="character-entry-page"><AppHeader section="Saguão" /><p role="status">Carregando personagem...</p></main>;
  if (!system) return <main className="character-entry-page"><AppHeader section="Saguão" backHref="/dashboard" backLabel="Voltar ao dashboard" /><h1>Sistema indisponível</h1></main>;
  return <CharacterHome systemName={system.name} character={character} fields={fields} onSwitch={() => push(`/systems/${encodeURIComponent(systemId)}/characters`)} />;
}
