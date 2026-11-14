'use client';

import { useEffect, useRef, useState } from 'react';
import { getCharacterExperience, getCharacterSheet, getGameSystems, getMyCharacterInventory, getSystemCharacters, type CharacterExperienceSummary, type CharacterInventory, type CharacterSheetDefinition, type CharacterSheetField, type GameSystem, type SystemCharacter } from '../../api';
import { CharacterHome } from './character-home';
import { AppHeader } from '../shell/app-header';
import { definitionToLegacyFields } from '../system-creation/sheet-model';

export function CharacterHomePage({ systemId, characterId, push }: { systemId: string; characterId: string; push: (path: string) => void }) {
  const [system, setSystem] = useState<GameSystem | null>(null);
  const [character, setCharacter] = useState<SystemCharacter | null>(null);
  const [fields, setFields] = useState<CharacterSheetField[]>([]);
  const [sheetDefinition, setSheetDefinition] = useState<CharacterSheetDefinition | null>(null);
  const [experience, setExperience] = useState<CharacterExperienceSummary | null>(null);
  const [inventory, setInventory] = useState<CharacterInventory | null>(null);
  const [recordLoading, setRecordLoading] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dailyRewardVersion, setDailyRewardVersion] = useState(0);
  const recordRequestId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    recordRequestId.current += 1;
    setLoading(true);
    setCharacter(null);
    setSheetDefinition(null);
    setInventory(null);
    setRecordLoading(false);
    setSheetError(null);
    setInventoryError(null);
    Promise.all([getGameSystems(), getSystemCharacters(systemId), getCharacterSheet(systemId), getCharacterExperience(characterId).catch(() => null)])
      .then(([systemsResult, characterResult, sheet, experienceResult]) => {
        if (cancelled) return;
        setSystem(systemsResult.systems.find((item) => item.id === systemId) ?? null);
        const selected = characterResult.characters.find((item) => item.id === characterId && item.game_system_id === systemId && item.status === 'active') ?? null;
        setCharacter(selected);
        setSheetDefinition(sheet.definition);
        setFields(definitionToLegacyFields(sheet.definition));
        setExperience(experienceResult);
      })
      .catch(() => { if (!cancelled) { setSystem(null); setCharacter(null); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
      recordRequestId.current += 1;
    };
  }, [systemId, characterId]);

  async function refreshCharacterRecord() {
    if (!character) return;
    const requestId = ++recordRequestId.current;
    const selectedCharacterId = character.id;
    const selectedSystemId = character.game_system_id;
    setRecordLoading(true);
    setSheetError(null);
    setInventoryError(null);
    const [sheetResult, inventoryResult, charactersResult] = await Promise.allSettled([
      getCharacterSheet(selectedSystemId),
      getMyCharacterInventory(selectedCharacterId),
      getSystemCharacters(selectedSystemId),
    ]);
    if (requestId !== recordRequestId.current) return;
    if (sheetResult.status === 'fulfilled') {
      setSheetDefinition(sheetResult.value.definition);
      setFields(definitionToLegacyFields(sheetResult.value.definition));
    } else {
      setSheetError('Não foi possível atualizar a ficha. Tente novamente.');
    }
    if (inventoryResult.status === 'fulfilled') {
      if (inventoryResult.value.character.id === selectedCharacterId) setInventory(inventoryResult.value);
      else setInventoryError('O inventário retornado não corresponde ao personagem selecionado.');
    } else {
      setInventoryError('Não foi possível carregar o inventário deste personagem. Tente novamente.');
    }
    if (charactersResult.status === 'fulfilled') {
      const refreshedCharacter = charactersResult.value.characters.find((item) =>
        item.id === selectedCharacterId && item.game_system_id === selectedSystemId && item.status === 'active');
      setCharacter(refreshedCharacter ?? null);
      if (!refreshedCharacter) setInventoryError('Este personagem não está mais ativo neste sistema.');
    } else {
      setSheetError('Não foi possível atualizar os dados salvos do personagem. Tente novamente.');
    }
    setRecordLoading(false);
  }

  if (loading) return <main className="character-entry-page"><AppHeader activeItem="Meus Sistemas" /><p role="status">Carregando personagem...</p></main>;
  if (!system) return <main className="character-entry-page"><AppHeader activeItem="Meus Sistemas" backHref="/dashboard" backLabel="Voltar ao dashboard" /><h1>Sistema indisponível</h1></main>;
  return <CharacterHome
    systemName={system.name}
    character={character}
    sheetDefinition={sheetDefinition}
    inventory={inventory}
    recordLoading={recordLoading}
    sheetError={sheetError}
    inventoryError={inventoryError}
    onRefreshRecord={() => { void refreshCharacterRecord(); }}
    fields={fields}
    experience={experience}
    dailyRewardVersion={dailyRewardVersion}
    onDailyClaimed={() => setDailyRewardVersion((version) => version + 1)}
    onSwitch={() => push(`/systems/${encodeURIComponent(systemId)}/characters`)}
  />;
}
