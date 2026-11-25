'use client';

import { BifrostLoading } from '../loading/bifrost-loading';

import Link from 'next/link';
import type { FormEvent } from 'react';
import type { SocialGroupMember } from '../../api';

interface GroupCreationFormProps {
  name: string;
  friends: SocialGroupMember[];
  selectedIds: string[];
  loading: boolean;
  error: string;
  busy: boolean;
  onNameChange: (value: string) => void;
  onToggleFriend: (friend: SocialGroupMember) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  onRetry: () => void;
}

export function GroupCreationForm({ name, friends, selectedIds, loading, error, busy, onNameChange, onToggleFriend, onSubmit, onCancel, onRetry }: GroupCreationFormProps) {
  return <form className="group-creation-form" aria-labelledby="new-group-heading" onSubmit={onSubmit}>
    <h2 id="new-group-heading">Novo grupo</h2>
    <label htmlFor="new-group-name">Nome do grupo<input id="new-group-name" autoFocus required maxLength={80} value={name} disabled={busy} onChange={event => onNameChange(event.target.value)} /></label>
    <fieldset disabled={busy || loading || Boolean(error)}><legend>Amigos do grupo</legend>
      {loading ? <BifrostLoading variant="panel" label="Carregando amigos…" /> : error ? <p role="alert">{error}</p> : friends.length === 0
        ? <p>Você ainda não tem amigos adicionados. <Link href="/friends">Adicionar amigos</Link></p>
        : <ul className="group-friend-options">{friends.map(friend => <li key={friend.user_id}>
          <label><input type="checkbox" checked={selectedIds.includes(friend.user_id)} value={friend.user_id} onChange={() => onToggleFriend(friend)} />
            <span>{friend.display_name}{friend.username && <small>@{friend.username}</small>}</span>
          </label>
        </li>)}</ul>}
    </fieldset>
    {error && <button type="button" disabled={busy || loading} onClick={onRetry}>Tentar novamente</button>}
    <p role="status">{selectedIds.length} {selectedIds.length === 1 ? 'amigo selecionado' : 'amigos selecionados'}</p>
    <div className="group-creation-actions"><button type="submit" disabled={busy || loading || Boolean(error) || !name.trim()}>{busy ? <BifrostLoading variant="inline" label="Criando…" /> : 'Criar grupo'}</button>
      <button type="button" disabled={busy} onClick={onCancel}>Cancelar</button></div>
  </form>;
}
