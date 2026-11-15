'use client';

import { useState, type FormEvent } from 'react';
import { createSystemCampaign, type GameSystem, type SystemLobbySettings } from '../../api';
import { LobbyCustomizationForm } from './lobby-customization-form';
import './lobby-creator-tools.css';

export function LobbyCreatorTools({ system, characterId, settings, onSettingsSaved, onCampaignCreated, onSystemSaved }: {
  system: GameSystem;
  characterId: string;
  settings: SystemLobbySettings;
  onSettingsSaved: (settings: SystemLobbySettings) => void;
  onCampaignCreated: () => void;
  onSystemSaved: (system: GameSystem) => void;
}) {
  const [campaignName, setCampaignName] = useState('');
  const [campaignDescription, setCampaignDescription] = useState('');
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submitCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingCampaign(true); setMessage(''); setError('');
    try {
      await createSystemCampaign(system.id, { character_id: characterId, name: campaignName, description: campaignDescription || null });
      setCampaignName(''); setCampaignDescription(''); setMessage('Campanha criada. Você já pode abrir uma sala de chat abaixo.');
      onCampaignCreated();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível criar a campanha.'); }
    finally { setSavingCampaign(false); }
  }

  return <section className="lobby-creator-tools" aria-labelledby="lobby-creator-tools-heading">
    <header><p className="character-entry-eyebrow">ÁREA DO OWNER</p><h2 id="lobby-creator-tools-heading">Ferramentas do criador</h2></header>
    <form className="lobby-creator-campaign-form" onSubmit={(event) => void submitCampaign(event)}>
      <h3>Criar campanha</h3>
      <label>Nome da campanha<input required minLength={1} maxLength={80} value={campaignName} onChange={(event) => setCampaignName(event.target.value)} /></label>
      <label>Descrição (opcional)<textarea maxLength={2000} value={campaignDescription} onChange={(event) => setCampaignDescription(event.target.value)} /></label>
      <button type="submit" disabled={savingCampaign || !campaignName.trim()}>{savingCampaign ? 'Criando…' : 'Criar campanha'}</button>
    </form>
    {!settings.hidden_sections.includes('campaign-chat') && <a className="lobby-creator-chat-link" href="#campaign-chat-heading">Criar uma sala de chat</a>}
    <details className="lobby-customization">
      <summary>Personalizar saguão</summary>
      <LobbyCustomizationForm system={system} settings={settings} onSettingsSaved={onSettingsSaved} onSystemSaved={onSystemSaved} />
    </details>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
