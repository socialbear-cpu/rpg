'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createSystemChat, getMySystemMemberships, getSystemChats, type Chat } from '../../api';
import { hasSession } from '../../supabase-auth';
import { AppHeader } from '../shell/app-header';
import { RoomSettingsEditor } from './room-settings';
import '../characters/characters.css';
import './chat.css';

export function SystemRoomsPage({ systemId }: { systemId: string }) {
  const router = useRouter();
  const [rooms, setRooms] = useState<Chat[]>([]), [isOwner, setIsOwner] = useState(false), [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState(''), [description, setDescription] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [reload, setReload] = useState(0);
  useEffect(() => {
    if (!hasSession()) { router.replace('/'); return; }
    let active = true; setLoading(true); setError(''); setRooms([]); setIsOwner(false);
    Promise.all([getSystemChats(systemId), getMySystemMemberships()]).then(([result, access]) => {
      if (active) { setRooms(result.chats); setIsOwner(access.memberships.some(member => member.game_system_id === systemId && member.role === 'owner')); }
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as salas.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [systemId, reload, router]);
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await createSystemChat(systemId, { name, description }); setName(''); setDescription(''); setSelected(result.chat.id); setReload(value => value + 1); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível criar a sala.'); }
    finally { setBusy(false); }
  }
  return <main className="character-entry-page bifrost-workspace">
    <AppHeader backHref={`/systems/${encodeURIComponent(systemId)}/characters`} backLabel="Voltar ao sistema" />
    <h1>Salas de RPG</h1><p>As salas pertencem a este sistema. Owner e moderadores definem o acesso e as vagas.</p>
    {error && <p role="alert">{error}<button onClick={() => setReload(value => value + 1)}>Tentar novamente</button></p>}
    {loading ? <p role="status">Carregando salas…</p> : <>
      {isOwner && <form className="room-settings-form" onSubmit={create}><h2>Criar sala</h2>
        <label>Nome<input required maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label>
        <label>Descrição<textarea maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} /></label>
        <button disabled={busy || !name.trim()}>{busy ? 'Criando…' : 'Criar sala'}</button>
      </form>}
      <ul className="room-directory">{rooms.map(room => <li key={room.id}><strong>{room.name}</strong><span>{room.player_count} / {room.max_players ?? 'sem limite'} jogadores</span>
        {room.can_manage && <button type="button" onClick={() => setSelected(room.id)}>Configurar sala {room.name}</button>}</li>)}</ul>
      {rooms.length === 0 && <p>Nenhuma sala disponível.</p>}
    </>}
    {selected && <RoomSettingsEditor key={selected} chatId={selected} onSaved={() => setReload(value => value + 1)} onClose={() => setSelected(null)} />}
  </main>;
}
