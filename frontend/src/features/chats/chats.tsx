'use client';

import { BifrostLoading } from '../loading/bifrost-loading';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, getCharacterChatMessages, getCharacterChats, joinCharacterChat, leaveCharacterChat, sendCharacterChatMessage, type Chat, type ChatMessage } from '../../api';
import { chatsForCurrentCharacter, clearChatDraftIfUnchanged, emptyChatDrafts, updateChatDraft } from './chat-state';
import './chat.css';
import { InviteFriendControl } from '../social/invite-friend-control';
import { RoomSettingsEditor } from './room-settings';

interface ChatPanelProps {
  chats: Chat[];
  selectedChatId: string | null;
  messages: ChatMessage[];
  characterId: string;
  content: string;
  loadingChats: boolean;
  loadingMessages: boolean;
  sending: boolean;
  error: string | null;
  onSelectChat: (chatId: string) => void;
  onContentChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  view?: 'full' | 'dashboard';
  onOpenConversation?: (chatId: string) => void;
  onRetry?: () => void;
  onJoin?: () => void;
  onLeave?: () => void;
  onConfigure?: () => void;
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export function ChatPanel({ chats, selectedChatId, messages, characterId, content, loadingChats, loadingMessages, sending, error, onSelectChat, onContentChange, onSubmit, view = 'full', onOpenConversation, onRetry, onJoin, onLeave, onConfigure }: ChatPanelProps) {
  const messageList = useRef<HTMLOListElement>(null);
  const selectedChat = chats.find((chat) => chat.id === selectedChatId) ?? null;
  const canWrite = Boolean(selectedChat?.permissions.view && selectedChat.permissions.write && selectedChat.is_member);
  const full = Boolean(selectedChat && selectedChat.max_players !== null && selectedChat.player_count >= selectedChat.max_players && !selectedChat.has_player_seat);
  useEffect(() => { messageList.current?.scrollTo({ top: messageList.current.scrollHeight, behavior: 'smooth' }); }, [messages]);
  if (view === 'dashboard') {
    const latestMessage = selectedChat?.permissions.view ? messages.at(-1) ?? null : null;
    return <>
      <section className="chat-directory" aria-labelledby="chats-heading">
        <header className="lobby-section-heading"><h2 id="chats-heading">Salas e conversas</h2>{!loadingChats && chats.length > 0 && <span className="lobby-room-count">{chats.length} {chats.length === 1 ? 'sala' : 'salas'}</span>}</header>
        {loadingChats ? <BifrostLoading variant="panel" label="Carregando chats…" /> : chats.length === 0
          ? <p className="chat-empty">Este personagem ainda não participa de nenhum chat.</p>
          : <div className="lobby-room-list">{chats.map((item) => <button className="lobby-room-row" key={item.id} type="button" aria-label={`Abrir sala ${item.name}`} aria-pressed={selectedChatId === item.id} onClick={() => { onSelectChat(item.id); onOpenConversation?.(item.id); }}>
            <span className="lobby-room-symbol" aria-hidden="true">✦</span><span className="lobby-room-copy"><strong>{item.name}</strong>{item.description && <small>{item.description}</small>}</span>
          </button>)}</div>}
        {error && <p className="chat-error" role="alert">{error}{onRetry && <button type="button" onClick={onRetry}>Tentar novamente</button>}</p>}
      </section>
      <section className="chat-recents" aria-labelledby="chat-recents-heading">
        <header className="lobby-section-heading"><h2 id="chat-recents-heading">Conversas recentes</h2>{selectedChat && <button className="chat-recent-open" type="button" onClick={() => onOpenConversation?.(selectedChat.id)}>Abrir chat <span aria-hidden="true">→</span></button>}</header>
        {loadingChats ? <BifrostLoading variant="panel" label="Carregando conversas…" /> : !selectedChat
          ? <p className="chat-empty">Nenhuma conversa recente.</p>
          : loadingMessages ? <BifrostLoading variant="panel" label="Carregando mensagens…" />
            : latestMessage ? <button className="chat-recent-preview" type="button" onClick={() => onOpenConversation?.(selectedChat.id)}>
              <span className="chat-recent-icon" aria-hidden="true">✦</span><span className="chat-recent-copy"><strong>{selectedChat.name}</strong><small>{latestMessage.character_id === characterId ? 'Você' : 'Outro personagem'}: “{latestMessage.content}”</small></span>
            </button> : <div className="chat-recent-preview chat-recent-preview-empty"><span className="chat-recent-icon" aria-hidden="true">✦</span><span className="chat-recent-copy"><strong>{selectedChat.name}</strong><small>Nenhuma mensagem ainda.</small></span></div>}
      </section>
    </>;
  }

  return <section className="chat" aria-labelledby="chats-heading">
    <header className="lobby-section-heading"><div><span className="character-entry-eyebrow">CHAT DA MESA</span><h2 id="chats-heading">{selectedChat?.name ?? 'Salas de RPG'}</h2></div>{onRetry && <button type="button" disabled={sending || loadingChats} onClick={onRetry}>Atualizar salas</button>}</header>
    {loadingChats ? <BifrostLoading variant="panel" label="Carregando chats…" /> : chats.length === 0
      ? <p className="chat-empty">Este personagem ainda não participa de nenhum chat.</p>
      : <div className="chat-layout">
        <nav className="chat-list" aria-label="Chats do personagem">
          {chats.map((item) => <button key={item.id} type="button" aria-pressed={selectedChatId === item.id} onClick={() => onSelectChat(item.id)}>
            <strong>{item.name}</strong>
            {item.description && <span>{item.description}</span>}
          </button>)}
        </nav>
        <div className="chat-conversation">
          {selectedChat ? <>
            <div className="chat-title-row"><h3>{selectedChat.name}</h3>{selectedChat.permissions.view && <InviteFriendControl chatId={selectedChat.id} />}{selectedChat.can_manage && <button type="button" onClick={onConfigure}>Configurar sala</button>}</div>
            <p>{selectedChat.player_count} / {selectedChat.max_players ?? 'sem limite'} jogadores</p>
            <div className="room-participation">{selectedChat.is_member ? <button type="button" disabled={sending} onClick={onLeave}>Sair da sala com este personagem</button>
              : selectedChat.permissions.view && <button type="button" disabled={sending || full || !selectedChat.permissions.enter} onClick={onJoin}>{full ? 'Sala cheia' : selectedChat.permissions.enter ? 'Entrar na sala' : 'Entrada não permitida'}</button>}</div>
            {!selectedChat.permissions.view ? <p>Você pode configurar esta sala, mas não tem permissão para visualizar as mensagens.</p> : <>
            {loadingMessages ? <BifrostLoading variant="panel" label="Carregando mensagens…" /> : <ol ref={messageList} className="chat-messages" aria-label={`Mensagens do chat ${selectedChat.name}`} aria-live="polite">
              {messages.map((message) => <li className={message.character_id === characterId ? 'chat-message-own' : undefined} key={message.id}>
                <span>{message.character_id === characterId ? 'Você' : 'Personagem'} · {formatMessageTime(message.created_at)}</span><p>{message.content}</p>
              </li>)}
            </ol>}
            <form className="chat-composer" onSubmit={onSubmit}>
              <label className="sr-only" htmlFor="chat-message">Mensagem para {selectedChat.name}</label>
              <textarea id="chat-message" disabled={!canWrite || sending} value={canWrite ? content : ''} onChange={(event) => onContentChange(event.target.value)} placeholder="Escreva uma mensagem…" maxLength={2000} />
              <button type="submit" disabled={!canWrite || sending || !content.trim()}>{sending ? <BifrostLoading variant="inline" label="Enviando…" /> : 'Enviar mensagem'}</button>
            </form>
            {!canWrite && <p>{selectedChat.is_member ? 'Você não tem permissão para digitar nesta sala.' : 'Entre com seu personagem para enviar mensagens.'}</p>}
            </>}
          </> : <p>Selecione um chat para ver as mensagens.</p>}
        </div>
      </div>}
    {error && <p className="chat-error" role="alert">{error}{onRetry && <button type="button" onClick={onRetry}>Tentar novamente</button>}</p>}
  </section>;
}

export function Chats({ characterId, reloadToken = 0, preferredChatId = null, view = 'full', onOpenConversation }: { characterId: string; reloadToken?: number; preferredChatId?: string | null; view?: 'full' | 'dashboard'; onOpenConversation?: (chatId: string) => void }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatsCharacterId, setChatsCharacterId] = useState<string | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesKey, setMessagesKey] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [drafts, setDrafts] = useState(emptyChatDrafts);
  const currentContext = useRef({ characterId, chatId: null as string | null });
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const visibleChats = chatsForCurrentCharacter(chats, chatsCharacterId, characterId);
  const visibleChatId = chatsCharacterId === characterId ? selectedChatId : null;
  const draftKey = visibleChatId ? `${characterId}:${visibleChatId}` : '';
  const content = draftKey ? drafts.values[draftKey] ?? '' : '';
  const selectedChat = visibleChats.find(chat => chat.id === visibleChatId);
  const visibleMessages = messagesKey === draftKey ? messages : [];
  currentContext.current = { characterId, chatId: visibleChatId };

  useEffect(() => {
    let active = true;
    const previousChatId = currentContext.current.chatId;
    setLoadingChats(true); setError(null); setChats([]); setChatsCharacterId(null); setSelectedChatId(null); setMessages([]);
    getCharacterChats(characterId).then(({ chats: loadedChats }) => {
      if (!active) return;
      setChats(loadedChats);
      setChatsCharacterId(characterId);
      setSelectedChatId(loadedChats.find((chat) => chat.id === (previousChatId ?? preferredChatId))?.id ?? loadedChats[0]?.id ?? null);
      setDrafts(current => {
        const allowed = new Set(loadedChats.filter(chat => chat.permissions.view && chat.permissions.write).map(chat => `${characterId}:${chat.id}`));
        return { values: Object.fromEntries(Object.entries(current.values).filter(([key]) => !key.startsWith(`${characterId}:`) || allowed.has(key))), versions: current.versions };
      });
    }).catch((reason) => {
      if (active) {
        setChats([]); setChatsCharacterId(characterId); setSelectedChatId(null); setMessages([]);
        setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os chats.');
      }
    }).finally(() => { if (active) setLoadingChats(false); });
    return () => { active = false; };
  }, [characterId, reload, reloadToken, preferredChatId]);

  useEffect(() => {
    if (!visibleChatId || !selectedChat?.permissions.view) { setMessages([]); setMessagesKey(null); return; }
    let active = true;
    setLoadingMessages(true); setError(null); setMessages([]);
    getCharacterChatMessages(characterId, visibleChatId).then(({ messages: loadedMessages }) => {
      if (active) { setMessages(loadedMessages); setMessagesKey(`${characterId}:${visibleChatId}`); }
    }).catch((reason) => {
      if (active) {
        setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as mensagens.');
        if (reason instanceof ApiError && [403, 404].includes(reason.status)) {
          setMessages([]); setMessagesKey(null); setDrafts(emptyChatDrafts);
          setChats(current => current.filter(chat => chat.id !== visibleChatId));
        }
      }
    }).finally(() => { if (active) setLoadingMessages(false); });
    return () => { active = false; };
  }, [characterId, visibleChatId, selectedChat?.permissions.view, reload]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const chatId = visibleChatId;
    const messageContent = content.trim();
    if (!chatId || !messageContent || !selectedChat?.is_member || !selectedChat.permissions.write || !selectedChat.permissions.view) return;
    const sentCharacterId = characterId;
    const key = `${sentCharacterId}:${chatId}`;
    const version = drafts.versions[key] ?? 0;
    setSending(true); setError(null);
    try {
      const { message } = await sendCharacterChatMessage(sentCharacterId, chatId, messageContent);
      if (currentContext.current.characterId === sentCharacterId && currentContext.current.chatId === chatId) {
        setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      }
      setDrafts((current) => clearChatDraftIfUnchanged(current, key, version));
    } catch (reason) {
      if (currentContext.current.characterId === sentCharacterId && currentContext.current.chatId === chatId) {
        setError(reason instanceof Error ? reason.message : 'Não foi possível enviar a mensagem.');
        if (reason instanceof ApiError && [403, 404].includes(reason.status)) { setMessages([]); setMessagesKey(null); setDrafts(emptyChatDrafts); setReload(value => value + 1); }
      }
    } finally { setSending(false); }
  }

  function changeDraft(value: string) {
    if (!draftKey) return;
    setDrafts((current) => updateChatDraft(current, draftKey, value));
  }

  function retryChats() {
    setReload((value) => value + 1);
  }

  async function participate(join: boolean) {
    if (!visibleChatId) return;
    const chatId = visibleChatId, context = characterId;
    setSending(true); setError(null);
    try {
      if (join) await joinCharacterChat(context, chatId); else await leaveCharacterChat(context, chatId);
      if (currentContext.current.characterId === context && currentContext.current.chatId === chatId) { setDrafts(emptyChatDrafts); setReload(value => value + 1); }
    } catch (reason) {
      if (currentContext.current.characterId === context && currentContext.current.chatId === chatId) {
        setError(reason instanceof Error ? reason.message : 'Não foi possível alterar a participação.');
        if (reason instanceof ApiError && [403, 404].includes(reason.status)) { setMessages([]); setMessagesKey(null); setDrafts(emptyChatDrafts); setChats([]); }
      }
    } finally { setSending(false); }
  }

  return <><ChatPanel chats={visibleChats} selectedChatId={visibleChatId} messages={visibleMessages} characterId={characterId} content={content} loadingChats={loadingChats} loadingMessages={loadingMessages} sending={sending} error={error} onSelectChat={setSelectedChatId} onContentChange={changeDraft} onSubmit={(event) => void submit(event)} view={view} onOpenConversation={onOpenConversation} onRetry={retryChats} onJoin={() => void participate(true)} onLeave={() => void participate(false)} onConfigure={() => setConfiguring(visibleChatId)} />
    {configuring && selectedChat?.can_manage && <RoomSettingsEditor key={configuring} chatId={configuring} onClose={() => setConfiguring(null)} onSaved={() => { setConfiguring(null); setReload(value => value + 1); }} />}
  </>;
}
