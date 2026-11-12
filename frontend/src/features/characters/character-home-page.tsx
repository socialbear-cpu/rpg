'use client';

import { useEffect, useState } from 'react';
import { getCharacterExperience, getCharacterSheet, getGameSystems, getSystemCharacters, type CharacterExperienceSummary, type CharacterSheetField, type GameSystem, type SystemCharacter } from '../../api';
import { CharacterHome } from './character-home';
import { AppHeader } from '../shell/app-header';
import { definitionToLegacyFields } from '../system-creation/sheet-model';

export function CharacterHomePage({ systemId, characterId, push }: { systemId: string; characterId: string; push: (path: string) => void }) {
  const [system, setSystem] = useState<GameSystem | null>(null);
  const [character, setCharacter] = useState<SystemCharacter | null>(null);
  const [fields, setFields] = useState<CharacterSheetField[]>([]);
  const [experience, setExperience] = useState<CharacterExperienceSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getGameSystems(), getSystemCharacters(systemId), getCharacterSheet(systemId), getCharacterExperience(characterId).catch(() => null)])
      .then(([systemsResult, characterResult, sheet, experienceResult]) => {
        if (cancelled) return;
        setSystem(systemsResult.systems.find((item) => item.id === systemId) ?? null);
        const selected = characterResult.characters.find((item) => item.id === characterId && item.game_system_id === systemId && item.status === 'active') ?? null;
        setCharacter(selected);
        setFields(definitionToLegacyFields(sheet.definition));
        setExperience(experienceResult);
      })
      .catch(() => { if (!cancelled) { setSystem(null); setCharacter(null); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [systemId, characterId]);

  if (loading) return <main className="character-entry-page"><AppHeader activeItem="Meus Sistemas" /><p role="status">Carregando personagem...</p></main>;
  if (!system) return <main className="character-entry-page"><AppHeader activeItem="Meus Sistemas" backHref="/dashboard" backLabel="Voltar ao dashboard" /><h1>Sistema indisponível</h1></main>;
  return <CharacterHome systemName={system.name} character={character} fields={fields} experience={experience} onSwitch={() => push(`/systems/${encodeURIComponent(systemId)}/characters`)} />;
}
