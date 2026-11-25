'use client';

import { BifrostLoading } from '../loading/bifrost-loading';

import { useEffect, useRef, useState } from 'react';
import { defaultSystemLobbySettings, getCharacterExperience, getCharacterSheet, getGameSystems, getMyCharacterInventory, getMySystemMemberships, getSystemLobbySettings, getSystemCharacters, type CharacterExperienceSummary, type CharacterInventory, type CharacterSheetDefinition, type CharacterSheetField, type GameSystem, type SystemCharacter, type SystemLobbySettings } from '../../api';
import { CharacterHome } from './character-home';
import { AppHeader } from '../shell/app-header';
import { definitionToLegacyFields } from '../system-creation/sheet-model';

export async function loadCharacterHomePageData(systemId: string, characterId: string) {
  const [systemsResult, charactersResult, sheetResult, experienceResult] = await Promise.allSettled([
    getGameSystems(), getSystemCharacters(systemId), getCharacterSheet(systemId), getCharacterExperience(characterId),
  ]);
  if (systemsResult.status === 'rejected') throw systemsResult.reason;
  if (charactersResult.status === 'rejected') throw charactersResult.reason;

  const system = systemsResult.value.systems.find((item) => item.id === systemId) ?? null;
  const character = charactersResult.value.characters.find((item) =>
    item.id === characterId && item.game_system_id === systemId && item.status === 'active') ?? null;
  const sheet = sheetResult.status === 'fulfilled' ? sheetResult.value.definition : null;
  return {
    system,
    character,
    sheetDefinition: sheet,
    fields: sheet ? definitionToLegacyFields(sheet) : [],
    experience: experienceResult.status === 'fulfilled' ? experienceResult.value : null,
    sheetError: sheetResult.status === 'rejected' ? 'Não foi possível carregar a ficha deste personagem. Tente novamente.' : null,
  };
}

export function CharacterHomePage({ systemId, characterId, preferredChatId = null, push }: { systemId: string; characterId: string; preferredChatId?: string | null; push: (path: string) => void }) {
  const [system, setSystem] = useState<GameSystem | null>(null);
  const [character, setCharacter] = useState<SystemCharacter | null>(null);
  const [fields, setFields] = useState<CharacterSheetField[]>([]);
  const [sheetDefinition, setSheetDefinition] = useState<CharacterSheetDefinition | null>(null);
  const [experience, setExperience] = useState<CharacterExperienceSummary | null>(null);
  const [inventory, setInventory] = useState<CharacterInventory | null>(null);
  const [recordLoading, setRecordLoading] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [dailyRewardVersion, setDailyRewardVersion] = useState(0);
  const [isCreator, setIsCreator] = useState(false);
  const [lobbySettings, setLobbySettings] = useState<SystemLobbySettings>(defaultSystemLobbySettings);
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
    setLoadError(null);
    setIsCreator(false);
    setLobbySettings(defaultSystemLobbySettings);
    loadCharacterHomePageData(systemId, characterId)
      .then((result) => {
        if (cancelled) return;
        setSystem(result.system);
        setCharacter(result.character);
        setSheetDefinition(result.sheetDefinition);
        setFields(result.fields);
        setExperience(result.experience);
        setSheetError(result.sheetError);
        void Promise.allSettled([getMySystemMemberships(), getSystemLobbySettings(systemId)]).then(([accessResult, settingsResult]) => {
          if (cancelled) return;
          setIsCreator(accessResult.status === 'fulfilled' && (accessResult.value.is_platform_admin || accessResult.value.memberships.some((membership) => membership.game_system_id === systemId && membership.role === 'owner')));
          setLobbySettings(settingsResult.status === 'fulfilled' ? settingsResult.value.settings : defaultSystemLobbySettings);
        });
      })
      .catch(() => { if (!cancelled) { setSystem(null); setCharacter(null); setLoadError('Não foi possível carregar a tela do sistema. Tente novamente.'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
      recordRequestId.current += 1;
    };
  }, [systemId, characterId, loadAttempt]);

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

  if (loading) return <main className="character-entry-page bifrost-workspace"><AppHeader activeItem="Meus Sistemas" /><BifrostLoading variant="screen" label="Carregando personagem..." /></main>;
  if (loadError) return <main className="character-entry-page bifrost-workspace"><AppHeader activeItem="Meus Sistemas" backHref="/dashboard" backLabel="Voltar ao dashboard" /><section aria-labelledby="character-home-load-error"><h1 id="character-home-load-error">Não foi possível abrir o sistema</h1><p role="alert">{loadError}</p><button className="character-primary-button" type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Tentar novamente</button></section></main>;
  if (!system) return <main className="character-entry-page bifrost-workspace"><AppHeader activeItem="Meus Sistemas" backHref="/dashboard" backLabel="Voltar ao dashboard" /><h1>Sistema indisponível</h1></main>;
  return <CharacterHome
    system={system}
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
    isCreator={isCreator}
    lobbySettings={lobbySettings}
    preferredChatId={preferredChatId}
    onDailyClaimed={() => setDailyRewardVersion((version) => version + 1)}
    onSwitch={() => push(`/systems/${encodeURIComponent(systemId)}/characters`)}
  />;
}
