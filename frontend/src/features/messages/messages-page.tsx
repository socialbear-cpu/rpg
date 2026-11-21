'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, changeSocialGroupMember, createSocialGroup, getDirectConversations, getDirectMessages, getMyProfile, getSocialGroup, getSocialGroups, leaveSocialGroup, renameSocialGroup, searchSocialProfiles, sendDirectMessage, sendSocialGroupMessage, transferSocialGroup, type DirectConversation, type SocialGroup, type SocialGroupMember, type SocialProfile } from '../../api';
import { hasSession } from '../../supabase-auth';
import { AppHeader } from '../shell/app-header';
import { clearChatDraftIfUnchanged, emptyChatDrafts, updateChatDraft } from '../chats/chat-state';
import './messages.css';

interface AccountMessage { id: string; sender_user_id: string; content: string; created_at: string; }
type Selection = { type: 'direct' | 'group'; id: string; name: string };
const keyOf = (selection: Selection | null) => selection ? `${selection.type}:${selection.id}` : '';

export function MessagesConversation({ title, messages, members, userId, draft, busy, onDraft, onSend }: {
  title: string; messages: AccountMessage[]; members: SocialGroupMember[]; userId: string; draft: string; busy: boolean;
  onDraft: (value: string) => void; onSend: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return <section className="messages-conversation" aria-label={`Conversa ${title}`}><h2>{title}</h2>
    <ol className="messages-timeline" aria-live="polite">{messages.map(message => <li key={message.id} data-own={message.sender_user_id === userId}>
      <strong>{members.find(member => member.user_id === message.sender_user_id)?.display_name ?? (message.sender_user_id === userId ? 'Você' : 'Jogador')}</strong>
      <time dateTime={message.created_at}>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(message.created_at))}</time>
      <p>{message.content}</p>
    </li>)}</ol>
    {messages.length === 0 && <p>Nenhuma mensagem ainda.</p>}
    <form className="messages-composer" onSubmit={onSend}><label htmlFor="account-message">Mensagem para {title}</label>
      <textarea id="account-message" required maxLength={2000} value={draft} onChange={event => onDraft(event.target.value)} disabled={busy} />
      <button disabled={busy || !draft.trim()}>{busy ? 'Enviando…' : 'Enviar mensagem'}</button>
    </form>
  </section>;
}

export function MessagesPage() {
  const router = useRouter();
  const [userId, setUserId] = useState(''), [userName, setUserName] = useState('Você');
  const [directs, setDirects] = useState<DirectConversation[]>([]), [groups, setGroups] = useState<SocialGroup[]>([]);
  const [selected, setSelected] = useState<Selection | null>(null), [loadedKey, setLoadedKey] = useState('');
  const [messages, setMessages] = useState<AccountMessage[]>([]), [members, setMembers] = useState<SocialGroupMember[]>([]), [group, setGroup] = useState<SocialGroup | null>(null);
  const [query, setQuery] = useState(''), [results, setResults] = useState<SocialProfile[]>([]), [searching, setSearching] = useState(false);
  const [newName, setNewName] = useState(''), [picked, setPicked] = useState<SocialGroupMember[]>([]), [groupName, setGroupName] = useState('');
  const [drafts, setDrafts] = useState(emptyChatDrafts), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [loadingConversation, setLoadingConversation] = useState(false), [error, setError] = useState(''), [reload, setReload] = useState(0);
  const selectedKey = keyOf(selected), currentKey = useRef(selectedKey);
  currentKey.current = selectedKey;
  const ready = loadedKey === selectedKey && selectedKey !== '';
  const owner = ready && group?.owner_user_id === userId;

  useEffect(() => {
    if (!hasSession()) { router.replace('/'); return; }
    let active = true; setLoading(true);
    Promise.all([getMyProfile(), getDirectConversations(), getSocialGroups()]).then(([profile, inbox, collection]) => {
      if (!active) return;
      setUserId(profile.user_id); setUserName(profile.display_name); setDirects(inbox.conversations); setGroups(collection.groups);
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar suas conversas.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [router, reload]);

  useEffect(() => {
    let active = true; setResults([]);
    if (query.trim().length < 2) { setSearching(false); return; }
    setSearching(true);
    const timeout = setTimeout(() => {
      searchSocialProfiles(query.trim()).then(value => { if (active) setResults(value.results.filter(profile => profile.user_id !== userId)); })
        .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível buscar jogadores.'); }).finally(() => { if (active) setSearching(false); });
    }, 250);
    return () => { active = false; clearTimeout(timeout); };
  }, [query, userId]);

  useEffect(() => {
    let active = true; setMessages([]); setMembers([]); setGroup(null); setLoadedKey(''); setError('');
    if (!selected) return;
    const selection = selected; setLoadingConversation(true);
    async function load() {
      try {
        if (selection.type === 'group') {
          const value = await getSocialGroup(selection.id);
          if (active) { setGroup(value.group); setGroupName(value.group.name); setMembers(value.members); setMessages(value.messages); }
        } else {
          const value = await getDirectMessages(selection.id);
          if (active) { setMessages(value.messages); setMembers([{ user_id: selection.id, display_name: selection.name, username: null }, { user_id: userId, display_name: userName, username: null }]); }
        }
        if (active) setLoadedKey(keyOf(selection));
      } catch (reason) {
        if (active) {
          setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a conversa.');
          if (reason instanceof ApiError && [403, 404].includes(reason.status)) setDrafts(emptyChatDrafts);
        }
      } finally { if (active) setLoadingConversation(false); }
    }
    void load(); return () => { active = false; };
  }, [selectedKey, reload, userId, userName]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || !ready || busy) return;
    const selection = selected, key = selectedKey, content = (drafts.values[key] ?? '').trim(), version = drafts.versions[key] ?? 0;
    if (!content) return;
    setBusy(true); setError('');
    try {
      if (selection.type === 'group') {
        const value = await sendSocialGroupMessage(selection.id, content);
        if (currentKey.current === key) setMessages(current => [...current, value.message]);
      } else {
        await sendDirectMessage(selection.id, content);
        const value = await getDirectMessages(selection.id);
        if (currentKey.current === key) setMessages(value.messages);
      }
      setDrafts(current => clearChatDraftIfUnchanged(current, key, version));
      const inbox = await getDirectConversations(); setDirects(inbox.conversations);
    } catch (reason) { handleFailure(reason, key); }
    finally { setBusy(false); }
  }
  function handleFailure(reason: unknown, key: string) {
    if (currentKey.current !== key) return;
    setError(reason instanceof Error ? reason.message : 'Não foi possível concluir a ação.');
    if (reason instanceof ApiError && [403, 404].includes(reason.status)) { setMessages([]); setMembers([]); setGroup(null); setLoadedKey(''); setDrafts(emptyChatDrafts); }
  }
  async function groupAction(action: () => Promise<unknown>, leaving = false) {
    const key = selectedKey; setBusy(true); setError('');
    try {
      await action();
      if (currentKey.current === key && leaving) { setSelected(null); setMessages([]); setDrafts(emptyChatDrafts); }
      setReload(value => value + 1);
    } catch (reason) { handleFailure(reason, key); }
    finally { setBusy(false); }
  }
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const value = await createSocialGroup(newName, picked.map(member => member.user_id));
      setNewName(''); setPicked([]); setSelected({ type: 'group', id: value.group.id, name: value.group.name }); setReload(value => value + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível criar o grupo.'); }
    finally { setBusy(false); }
  }

  return <main className="messages-page bifrost-workspace"><AppHeader activeItem="Mensagens" />
    <header className="messages-heading"><h1>Mensagens</h1><p>Converse com jogadores por mensagens diretas ou grupos. As salas de RPG ficam dentro de cada sistema.</p><button type="button" disabled={busy || loading} onClick={() => setReload(value => value + 1)}>Atualizar conversas</button></header>
    {error && <p role="alert">{error}<button type="button" onClick={() => setReload(value => value + 1)}>Tentar novamente</button></p>}
    <div className="messages-layout"><aside className="messages-directory">
      <label htmlFor="message-player-search">Buscar jogadores<input id="message-player-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Nome do jogador" /></label>
      {searching && <p role="status">Buscando…</p>}
      <ul>{results.map(profile => <li key={profile.user_id}><strong>{profile.display_name} @{profile.username}</strong>
        <button type="button" onClick={() => setSelected({ type: 'direct', id: profile.user_id, name: profile.display_name })}>Conversar</button>
        <button type="button" disabled={picked.some(member => member.user_id === profile.user_id)} onClick={() => setPicked(current => [...current, { user_id: profile.user_id, display_name: profile.display_name, username: profile.username }])}>Selecionar para novo grupo</button>
        {owner && group && <button type="button" disabled={busy || members.some(member => member.user_id === profile.user_id)} onClick={() => void groupAction(() => changeSocialGroupMember(group.id, profile.user_id, true))}>Adicionar ao grupo atual</button>}
      </li>)}</ul>
      <details><summary>Criar grupo</summary><form onSubmit={create}>
        <label>Nome do grupo<input required maxLength={80} value={newName} onChange={event => setNewName(event.target.value)} /></label>
        <p>Selecione jogadores na busca acima.</p>
        <ul>{picked.map(member => <li key={member.user_id}>{member.display_name}<button type="button" aria-label={`Remover ${member.display_name} da seleção`} onClick={() => setPicked(current => current.filter(item => item.user_id !== member.user_id))}>Remover</button></li>)}</ul>
        <button disabled={busy || !newName.trim()}>Criar grupo</button>
      </form></details>
      {loading ? <p role="status">Carregando conversas…</p> : <>
        <h2>Diretas</h2>{directs.length === 0 && <p>Busque um jogador para começar.</p>}<ul>{directs.map(conversation => <li key={conversation.user_id}>
          <button type="button" aria-pressed={selectedKey === `direct:${conversation.user_id}`} onClick={() => setSelected({ type: 'direct', id: conversation.user_id, name: conversation.display_name ?? conversation.username ?? 'Jogador' })}>{conversation.display_name ?? conversation.username ?? 'Jogador'}<small>{conversation.content}</small></button>
        </li>)}</ul>
        <h2>Grupos</h2>{groups.length === 0 && <p>Você ainda não participa de grupos.</p>}<ul>{groups.map(item => <li key={item.id}><button type="button" aria-pressed={selectedKey === `group:${item.id}`} onClick={() => setSelected({ type: 'group', id: item.id, name: item.name })}>{item.name}</button></li>)}</ul>
      </>}
    </aside><div className="messages-detail">
      {!selected ? <p>Selecione uma conversa ou busque um jogador.</p> : loadingConversation ? <p role="status">Carregando mensagens…</p> : ready && <>
        <MessagesConversation title={group?.name ?? selected.name} messages={messages} members={members} userId={userId} draft={drafts.values[selectedKey] ?? ''} busy={busy} onDraft={value => setDrafts(current => updateChatDraft(current, selectedKey, value))} onSend={event => void send(event)} />
        {group && <section className="messages-group-settings" aria-label="Participantes do grupo"><h3>Participantes</h3>
          {owner && <form onSubmit={event => { event.preventDefault(); void groupAction(() => renameSocialGroup(group.id, groupName)); }}><label>Nome do grupo<input required maxLength={80} value={groupName} onChange={event => setGroupName(event.target.value)} /></label><button disabled={busy || !groupName.trim()}>Renomear grupo</button></form>}
          <ul>{members.map(member => <li key={member.user_id}><span>{member.display_name}{member.user_id === group.owner_user_id ? ' · Criador' : ''}</span>
            {owner && member.user_id !== userId && <><button type="button" disabled={busy} onClick={() => void groupAction(() => changeSocialGroupMember(group.id, member.user_id, false))}>Remover {member.display_name}</button><button type="button" disabled={busy} onClick={() => void groupAction(() => transferSocialGroup(group.id, member.user_id))}>Transferir administração para {member.display_name}</button></>}
          </li>)}</ul>
          <button type="button" disabled={busy} onClick={() => void groupAction(() => leaveSocialGroup(group.id), true)}>Sair do grupo</button>
          {owner && members.length > 1 && <p>Transfira a administração antes de sair.</p>}
        </section>}
      </>}
    </div></div>
  </main>;
}
