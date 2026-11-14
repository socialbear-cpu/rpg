'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { createSystemCharacter, getCharacterSheet, getGameSystems, getMySystemMemberships, getSystemCharacters, requestSystemAccess, type CharacterSheetDefinition, type GameSystem, type SystemCharacter } from '../../api';
import { CharacterForm } from './character-form';
import { CharacterGallery } from './character-gallery';
import { AppHeader } from '../shell/app-header';
import './characters.css';
import { definitionToLegacyFields } from '../system-creation/sheet-model';

export function CharacterEntry({ systemId, push }: { systemId: string; push: (path: string) => void }) {
  const [system, setSystem] = useState<GameSystem | null>(null);
  const [definition, setDefinition] = useState<CharacterSheetDefinition>({version:1,steps:[{key:'step_1',label:'Etapa 1',position:0,components:[]}]});
  const [characters, setCharacters] = useState<SystemCharacter[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accessRequired, setAccessRequired] = useState(false);
  const [accessPassword, setAccessPassword] = useState('');
  const [accessSaving, setAccessSaving] = useState(false);
  const [accessError, setAccessError] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const systemsResult = await getGameSystems();
        if (cancelled) return;
        const activeSystem = systemsResult.systems.find((item) => item.id === systemId);
        if (!activeSystem) throw new Error('SYSTEM_UNAVAILABLE');
        setSystem(activeSystem);
        if (!activeSystem.is_public) {
          const memberships = await getMySystemMemberships();
          if (cancelled) return;
          if (!memberships.is_platform_admin && !memberships.memberships.some((membership) => membership.game_system_id === systemId)) {
            setAccessRequired(true);
            return;
          }
        }
        await loadSystemContent(() => cancelled);
      } catch {
        if (!cancelled) setError('Não foi possível abrir este sistema.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [systemId]);

  async function loadSystemContent(isCancelled: () => boolean = () => false) {
    const [sheet, characterResult] = await Promise.all([
      getCharacterSheet(systemId),
      getSystemCharacters(systemId),
    ]);
    if (!isCancelled()) {
        setDefinition(sheet.definition);
        setCharacters(characterResult.characters.filter((character) => character.status === 'active' && character.game_system_id === systemId));
    }
  }

  async function submitAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccessSaving(true);
    setAccessError('');
    try {
      await requestSystemAccess(systemId, accessPassword);
      setLoading(true);
      await loadSystemContent();
      setAccessRequired(false);
      setAccessPassword('');
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : 'Não foi possível validar a senha.');
    } finally {
      setLoading(false);
      setAccessSaving(false);
    }
  }

  async function createCharacter(characterName: string, attributes: Record<string, unknown>) {
    setError(null);
    setSaving(true);
    try {
      const { character } = await createSystemCharacter(systemId, { character_name: characterName, attributes });
      setCharacters((current) => [...current, character]);
      setSelectedCharacterId(character.id);
      setCreating(false);
      setSaving(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Não foi possível criar o personagem. Confira a senha do sistema e os campos da ficha.');
      setSaving(false);
    }
  }

  if (loading) return <main className="character-entry-page"><AppHeader activeItem="Meus Sistemas" /><p role="status">Carregando sistema...</p></main>;
  if (error && !system) return <main className="character-entry-page"><AppHeader activeItem="Meus Sistemas" backHref="/dashboard" backLabel="Voltar ao dashboard" /><p role="alert">{error}</p></main>;
  if (!system) return null;
  if (accessRequired) return <main className="character-entry-page character-access-page">
    <AppHeader activeItem="Meus Sistemas" backHref="/dashboard" backLabel="Voltar aos sistemas" />
    <section className="character-access-card" aria-labelledby="character-access-title">
      <span className="character-entry-eyebrow">{system.name}</span>
      <h1 id="character-access-title">Acesso protegido</h1>
      <p>Informe a senha deste sistema para entrar e participar.</p>
      <form onSubmit={(event) => void submitAccess(event)}>
        <label className="character-form-field"><span>Senha do sistema</span>
          <input type="password" autoComplete="current-password" maxLength={72} required value={accessPassword} onChange={(event) => setAccessPassword(event.target.value)} />
        </label>
        {accessError && <p role="alert" className="character-form-error">{accessError}</p>}
        <button type="submit" className="character-primary-button" disabled={accessSaving}>{accessSaving ? 'Validando...' : 'Entrar no sistema'}</button>
      </form>
    </section>
  </main>;
  if (creating) return <main className="character-entry-page character-creation-page"><AppHeader activeItem="Meus Sistemas"><button className="app-header-back" type="button" onClick={() => setCreating(false)}>← Voltar aos personagens</button></AppHeader><header className="character-entry-heading"><span className="character-entry-eyebrow">{system.name}</span><h1>Crie seu personagem</h1></header><CharacterForm definition={definition} error={error} saving={saving} onSubmit={(name, attributes) => void createCharacter(name, attributes)} onCancel={() => setCreating(false)} /></main>;
  return <CharacterGallery systemName={system.name} system={system} fields={definitionToLegacyFields(definition)} characters={characters} selectedCharacterId={selectedCharacterId} onCreate={() => { setError(null); setCreating(true); }} onEnter={(characterId) => push(`/systems/${encodeURIComponent(systemId)}/home/${encodeURIComponent(characterId)}`)} />;
}
