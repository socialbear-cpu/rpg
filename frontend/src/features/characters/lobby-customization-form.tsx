'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { updateSystemLobbySettings, type GameSystem, type LobbySectionId, type SystemLobbySettings, lobbySectionIds } from '../../api';
import { SystemDetailsEditor } from '../system-management/system-details-editor';
import './lobby-creator-tools.css';

const sectionLabels: Record<LobbySectionId, string> = {
  'system-presentation': 'Apresentação do sistema',
  matchmaking: 'Procurar partida',
  store: 'Loja',
  'campaign-chat': 'Campanhas e chat',
  events: 'Eventos',
  'character-sheet': 'Minha ficha',
};

export function LobbyCustomizationForm({ system, settings, onSettingsSaved, onSystemSaved }: {
  system: GameSystem;
  settings: SystemLobbySettings;
  onSettingsSaved: (settings: SystemLobbySettings) => void;
  onSystemSaved: (system: GameSystem) => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [savingSettings, setSavingSettings] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { setDraft(settings); }, [settings]);

  async function submitSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingSettings(true); setMessage(''); setError('');
    try {
      const result = await updateSystemLobbySettings(system.id, draft);
      setDraft(result.settings); onSettingsSaved(result.settings); setMessage('Saguão atualizado.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o saguão.'); }
    finally { setSavingSettings(false); }
  }

  function moveSection(section: LobbySectionId, direction: -1 | 1) {
    setDraft((current) => {
      const order = [...current.section_order];
      const index = order.indexOf(section);
      const target = index + direction;
      if (target < 0 || target >= order.length) return current;
      [order[index], order[target]] = [order[target], order[index]];
      return { ...current, section_order: order };
    });
  }

  function setSectionVisible(section: LobbySectionId, visible: boolean) {
    setDraft((current) => ({ ...current, hidden_sections: visible
      ? current.hidden_sections.filter((hidden) => hidden !== section)
      : lobbySectionIds.filter((id) => id === section || current.hidden_sections.includes(id)),
    }));
  }

  return <>
    <form onSubmit={(event) => void submitSettings(event)}>
      <label>Título de boas-vindas<input maxLength={80} required value={draft.welcome_title} onChange={(event) => setDraft((current) => ({ ...current, welcome_title: event.target.value }))} /></label>
      <label>Texto de boas-vindas<textarea maxLength={240} value={draft.welcome_message} onChange={(event) => setDraft((current) => ({ ...current, welcome_message: event.target.value }))} /></label>
      <label>Cor de destaque<input aria-label="Cor de destaque" type="color" value={draft.accent_color} onChange={(event) => setDraft((current) => ({ ...current, accent_color: event.target.value.toUpperCase() }))} /></label>
      <fieldset><legend>Seções do saguão</legend>{draft.section_order.map((section, index) => <div className="lobby-customization-row" key={section}>
        <label><input type="checkbox" checked={!draft.hidden_sections.includes(section)} onChange={(event) => setSectionVisible(section, event.target.checked)} />{sectionLabels[section]}</label>
        <button type="button" aria-label={`Mover ${sectionLabels[section]} para cima`} disabled={index === 0} onClick={() => moveSection(section, -1)}>↑</button>
        <button type="button" aria-label={`Mover ${sectionLabels[section]} para baixo`} disabled={index === draft.section_order.length - 1} onClick={() => moveSection(section, 1)}>↓</button>
      </div>)}</fieldset>
      <details className="lobby-cover-editor"><summary>Alterar capa e apresentação</summary><SystemDetailsEditor system={system} section="settings" onSaved={onSystemSaved} /></details>
      <button type="submit" disabled={savingSettings}>{savingSettings ? 'Salvando…' : 'Salvar personalização'}</button>
    </form>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </>;
}
