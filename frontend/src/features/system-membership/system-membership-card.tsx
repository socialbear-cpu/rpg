'use client';

import { useEffect, useState, type FormEventHandler } from 'react';
import { searchSystemMembersByCharacterName, type SystemMemberCharacterSearchResult, type SystemMemberships } from '../../api';

type Props = {
  access: SystemMemberships;
  manageableSystems?: { game_system_id: string; game_system_name: string }[];
  busy: boolean;
  message: string | null;
  messageIsError: boolean;
  onAssign: (systemId: string, userId: string, isModerator: boolean) => void;
};

export function SystemMembershipError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <article className="card system-membership-card">
    <div className="section-heading"><div><p className="eyebrow">ACESSO</p><h2>Cargos por sistema</h2></div><span className="step">03</span></div>
    <p className="notice error" role="alert">{message}</p>
    <button className="button secondary" type="button" onClick={onRetry}>Tentar novamente</button>
  </article>;
}

const roleLabels = { owner: 'Owner', mod: 'Mod', user: 'User' } as const;

export function SystemMembershipCard({ access, manageableSystems = [], busy, message, messageIsError, onAssign }: Props) {
  const ownerSystems = access.memberships.filter((membership) => membership.role === 'owner');
  const availableSystems = access.is_platform_admin ? manageableSystems : ownerSystems;
  const [selectedSystemId, setSelectedSystemId] = useState(availableSystems[0]?.game_system_id ?? '');
  const [memberQuery, setMemberQuery] = useState('');
  const [memberResults, setMemberResults] = useState<SystemMemberCharacterSearchResult[]>([]);
  const [selectedMember, setSelectedMember] = useState<SystemMemberCharacterSearchResult | null>(null);
  const [memberSearchLoading, setMemberSearchLoading] = useState(false);
  const [memberSearchError, setMemberSearchError] = useState('');
  const [isModerator, setIsModerator] = useState(true);
  const selectedSystem = availableSystems.find((membership) => membership.game_system_id === selectedSystemId) ?? availableSystems[0];

  useEffect(() => {
    const query = memberQuery.trim();
    if (!selectedSystem || selectedMember || query.length < 2) {
      setMemberResults([]);
      setMemberSearchLoading(false);
      setMemberSearchError('');
      return;
    }
    let active = true;
    const timeout = window.setTimeout(() => {
      setMemberSearchLoading(true);
      setMemberSearchError('');
      void searchSystemMembersByCharacterName(selectedSystem.game_system_id, query)
        .then((response) => { if (active) setMemberResults(response.results); })
        .catch(() => { if (active) { setMemberResults([]); setMemberSearchError('Não foi possível pesquisar personagens.'); } })
        .finally(() => { if (active) setMemberSearchLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timeout); };
  }, [memberQuery, selectedMember, selectedSystem?.game_system_id]);

  const submit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    if (!selectedSystem || !selectedMember) return;
    onAssign(selectedSystem.game_system_id, selectedMember.user_id, isModerator);
  };

  return <article className="card system-membership-card">
    <div className="section-heading"><div><p className="eyebrow">ACESSO</p><h2>Cargos por sistema</h2></div><span className="step">03</span></div>
    {access.is_platform_admin && <p className="daily-state" role="status">Admin global — acesso a todos os sistemas.</p>}
    {access.memberships.length === 0 && !access.is_platform_admin && <p className="card-copy">Você ainda não tem cargos em sistemas.</p>}
    <ul className="system-membership-list">
      {access.memberships.map((membership) => <li key={membership.game_system_id}>
        <span>{membership.game_system_name}</span>
        <span className={`membership-role membership-role-${membership.role}`}>{roleLabels[membership.role]}</span>
      </li>)}
    </ul>
    {availableSystems.length > 0 && <>
      <p className="card-copy">Como {access.is_platform_admin ? 'Admin global' : 'Owner'}, você pode conceder ou remover o cargo Mod de uma pessoa já associada ao seu sistema.</p>
      {message && <p className={`notice${messageIsError ? ' error' : ''}`} role="status" aria-live="polite">{message}</p>}
      <form className="system-membership-form" onSubmit={submit}>
        <label className="daily-field" htmlFor="membership-system">Sistema de RPG
          <select id="membership-system" value={selectedSystem?.game_system_id ?? ''} onChange={(event) => { setSelectedSystemId(event.target.value); setSelectedMember(null); setMemberQuery(''); }}>
        {availableSystems.map((membership) => <option key={membership.game_system_id} value={membership.game_system_id}>{membership.game_system_name}</option>)}
          </select>
        </label>
        <label className="daily-field system-member-search" htmlFor="membership-character-search">Personagem da pessoa
          <input
            id="membership-character-search"
            type="text"
            autoComplete="off"
            required
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={!selectedMember && memberResults.length > 0}
            aria-controls="membership-character-results"
            placeholder="Digite o nome do personagem"
            value={memberQuery}
            onChange={(event) => { setMemberQuery(event.target.value); setSelectedMember(null); }}
          />
          {!selectedMember && memberQuery.trim().length >= 2 && <div className="system-member-search-results" id="membership-character-results" role="listbox" aria-label="Personagens encontrados">
            {memberSearchLoading && <span role="status">Pesquisando…</span>}
            {!memberSearchLoading && memberSearchError && <span role="alert">{memberSearchError}</span>}
            {!memberSearchLoading && !memberSearchError && memberResults.length === 0 && <span role="status">Nenhum personagem encontrado.</span>}
            {!memberSearchLoading && memberResults.map((member) => <button key={`${member.user_id}:${member.character_name}`} type="button" role="option" aria-selected={false} onClick={() => { setSelectedMember(member); setMemberQuery(`${member.character_name} — ${member.display_name}`); }}><strong>{member.character_name}</strong><small>{member.display_name}</small></button>)}
          </div>}
          {selectedMember && <small className="system-member-search-selected">Selecionado: {selectedMember.character_name} · {selectedMember.display_name}</small>}
          {memberQuery.trim().length < 2 && <small>Digite ao menos 2 letras para pesquisar.</small>}
        </label>
        <label className="daily-active-toggle">
          <input type="checkbox" checked={isModerator} onChange={(event) => setIsModerator(event.target.checked)} />
          Tornar moderador (desmarque para remover Mod)
        </label>
        <div className="actions"><button className="button primary" type="submit" disabled={busy || !selectedSystem || !selectedMember}>
          {busy ? 'Salvando…' : 'Salvar cargo'}
        </button></div>
      </form>
    </>}
  </article>;
}
