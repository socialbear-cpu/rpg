'use client';

import { useState, type FormEventHandler } from 'react';
import type { SystemMemberships } from '../../api';

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
  const [targetUserId, setTargetUserId] = useState('');
  const [isModerator, setIsModerator] = useState(true);
  const selectedSystem = availableSystems.find((membership) => membership.game_system_id === selectedSystemId) ?? availableSystems[0];

  const submit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    const userId = targetUserId.trim();
    if (!selectedSystem || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) return;
    onAssign(selectedSystem.game_system_id, userId, isModerator);
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
          <select id="membership-system" value={selectedSystem?.game_system_id ?? ''} onChange={(event) => setSelectedSystemId(event.target.value)}>
        {availableSystems.map((membership) => <option key={membership.game_system_id} value={membership.game_system_id}>{membership.game_system_name}</option>)}
          </select>
        </label>
        <label className="daily-field" htmlFor="membership-user-id">UUID do usuário
          <input
            id="membership-user-id"
            type="text"
            inputMode="text"
            autoComplete="off"
            required
            pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}"
            value={targetUserId}
            onChange={(event) => setTargetUserId(event.target.value)}
          />
        </label>
        <label className="daily-active-toggle">
          <input type="checkbox" checked={isModerator} onChange={(event) => setIsModerator(event.target.checked)} />
          Tornar moderador (desmarque para remover Mod)
        </label>
        <div className="actions"><button className="button primary" type="submit" disabled={busy || !selectedSystem}>
          {busy ? 'Salvando…' : 'Salvar cargo'}
        </button></div>
      </form>
    </>}
  </article>;
}
