'use client';

import { useState, type FormEvent } from 'react';
import type { DailyLoginSystemView } from '../../api';

type Props = {
  systems: DailyLoginSystemView[];
  loading: boolean;
  claimingSystemId: string | null;
  message: string | null;
  messageIsError: boolean;
  onClaim: (systemId: string, characterId: string) => void;
};

export function DailyLoginCard({ systems, loading, claimingSystemId, message, messageIsError, onClaim }: Props) {
  const availableSystems = systems.filter((entry) => entry.system.is_active && entry.characters.length > 0);
  const [selectedSystemId, setSelectedSystemId] = useState(availableSystems[0]?.system.id ?? '');
  const [selectedCharacterId, setSelectedCharacterId] = useState('');
  const selected = availableSystems.find((entry) => entry.system.id === selectedSystemId) ?? availableSystems[0];
  const character = selected?.characters.find((entry) => entry.id === selectedCharacterId) ?? selected?.characters[0];
  const today = selected?.today;
  const reward = today?.reward;
  const alreadyClaimed = today?.status === 'already_claimed';

  function submitClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selected && character && today?.status === 'available') onClaim(selected.system.id, character.id);
  }

  return <article className="card daily-login-card">
    <div className="section-heading"><div><p className="eyebrow">PRESENÇA</p><h2>Login diário</h2></div><span className="step">01</span></div>
    <p className="card-copy">Resgate o prêmio de hoje para um personagem do sistema escolhido.</p>
    {message && <p className={`notice${messageIsError ? ' error' : ''}`} role="status" aria-live="polite">{message}</p>}
    {loading && <p className="card-copy" role="status">Carregando sistemas…</p>}
    {!loading && availableSystems.length === 0 && <p className="card-copy">Nenhum sistema com personagem ativo disponível para resgate.</p>}
    {selected && <>
      {availableSystems.length > 1 && <label className="daily-field" htmlFor="daily-login-system">Sistema de RPG
        <select id="daily-login-system" value={selected.system.id} onChange={(event) => {
          setSelectedSystemId(event.target.value);
          setSelectedCharacterId('');
        }}>
          {availableSystems.map(({ system }) => <option key={system.id} value={system.id}>{system.name}</option>)}
        </select>
      </label>}
      {today?.status === 'calendar_unavailable' && <p className="daily-state" role="status">Este sistema ainda não tem um calendário diário ativo.</p>}
      {today?.status === 'system_unavailable' && <p className="daily-state" role="status">Este sistema está indisponível para resgates.</p>}
      {reward && <section className="daily-reward" aria-label="Recompensa de hoje">
        <span className="label-muted">RECOMPENSA DE HOJE{today?.local_date ? ` · ${today.local_date.split('-').reverse().join('/')}` : ''}</span>
        <strong>{reward.item_name}</strong>
        <span>{reward.quantity} {reward.quantity === 1 ? 'unidade' : 'unidades'}</span>
      </section>}
      {alreadyClaimed && <p className="daily-state" role="status">
        Recompensa resgatada hoje{today.claim ? ` para ${selected.characters.find((entry) => entry.id === today.claim?.character_id)?.character_name ?? 'seu personagem'}.` : '.'}
      </p>}
      {today?.status === 'available' && reward && <form className="form daily-claim-form" onSubmit={submitClaim}>
        <label className="daily-field" htmlFor="daily-login-character">Personagem que receberá o item
          <select id="daily-login-character" value={character?.id ?? ''} onChange={(event) => setSelectedCharacterId(event.target.value)} required>
            {selected.characters.map((entry) => <option key={entry.id} value={entry.id}>{entry.character_name}</option>)}
          </select>
        </label>
        <button className="button primary" type="submit" disabled={!character || claimingSystemId === selected.system.id}>
          {claimingSystemId === selected.system.id ? 'Resgatando…' : 'Resgatar recompensa'}
        </button>
      </form>}
    </>}
  </article>;
}
