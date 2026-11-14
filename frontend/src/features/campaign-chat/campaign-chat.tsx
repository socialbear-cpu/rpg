'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getCharacterChatMessages, getCharacterChatRooms, sendCharacterChatMessage, type CampaignChatMessage, type CampaignChatRoom } from '../../api';
import { clearCampaignChatDraftIfUnchanged, emptyCampaignChatDrafts, roomsForCurrentCharacter, updateCampaignChatDraft } from './campaign-chat-state';
import './campaign-chat.css';

interface CampaignChatPanelProps {
  rooms: CampaignChatRoom[];
  selectedRoomId: string | null;
  messages: CampaignChatMessage[];
  characterId: string;
  content: string;
  loadingRooms: boolean;
  loadingMessages: boolean;
  sending: boolean;
  error: string | null;
  onSelectRoom: (roomId: string) => void;
  onContentChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRetry?: () => void;
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export function CampaignChatPanel({ rooms, selectedRoomId, messages, characterId, content, loadingRooms, loadingMessages, sending, error, onSelectRoom, onContentChange, onSubmit, onRetry }: CampaignChatPanelProps) {
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null;
  return <section className="campaign-chat" aria-labelledby="campaign-chat-heading">
    <header className="lobby-section-heading"><div><span className="character-entry-eyebrow">CAMPANHAS DO PERSONAGEM</span><h2 id="campaign-chat-heading">Salas de bate-papo</h2></div></header>
    {loadingRooms ? <p role="status">Carregando salas…</p> : rooms.length === 0
      ? <p className="campaign-chat-empty">Este personagem ainda não participa de uma campanha com salas.</p>
      : <div className="campaign-chat-layout">
        <nav className="campaign-chat-rooms" aria-label="Salas das campanhas">
          {rooms.map((room) => <button key={room.id} type="button" aria-pressed={selectedRoomId === room.id} onClick={() => onSelectRoom(room.id)}>
            <span>{room.campaign_name}</span><strong>{room.name}</strong>
          </button>)}
        </nav>
        <div className="campaign-chat-conversation">
          {selectedRoom ? <>
            <h3>{selectedRoom.name}</h3>
            {loadingMessages ? <p role="status">Carregando mensagens…</p> : <ol className="campaign-chat-messages" aria-label={`Mensagens de ${selectedRoom.name}`} aria-live="polite">
              {messages.map((message) => <li className={message.character_id === characterId ? 'campaign-chat-message-own' : undefined} key={message.id}>
                <span>{message.character_id === characterId ? 'Você' : 'Personagem'} · {formatMessageTime(message.created_at)}</span><p>{message.content}</p>
              </li>)}
            </ol>}
            <form className="campaign-chat-composer" onSubmit={onSubmit}>
              <label className="sr-only" htmlFor="campaign-chat-message">Mensagem para {selectedRoom.name}</label>
              <textarea id="campaign-chat-message" value={content} onChange={(event) => onContentChange(event.target.value)} placeholder="Escreva uma mensagem…" maxLength={2000} />
              <button type="submit" disabled={sending || !content.trim()}>{sending ? 'Enviando…' : 'Enviar mensagem'}</button>
            </form>
          </> : <p>Selecione uma sala para ver as mensagens.</p>}
        </div>
      </div>}
    {error && <p className="campaign-chat-error" role="alert">{error}{onRetry && <button type="button" onClick={onRetry}>Tentar novamente</button>}</p>}
  </section>;
}

export function CampaignChat({ characterId }: { characterId: string }) {
  const [rooms, setRooms] = useState<CampaignChatRoom[]>([]);
  const [roomsCharacterId, setRoomsCharacterId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CampaignChatMessage[]>([]);
  const [drafts, setDrafts] = useState(emptyCampaignChatDrafts);
  const currentContext = useRef({ characterId, roomId: null as string | null });
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const visibleRooms = roomsForCurrentCharacter(rooms, roomsCharacterId, characterId);
  const visibleRoomId = roomsCharacterId === characterId ? selectedRoomId : null;
  const draftKey = visibleRoomId ? `${characterId}:${visibleRoomId}` : '';
  const content = draftKey ? drafts.values[draftKey] ?? '' : '';
  currentContext.current = { characterId, roomId: visibleRoomId };

  useEffect(() => {
    let active = true;
    setLoadingRooms(true); setError(null); setRooms([]); setRoomsCharacterId(null); setSelectedRoomId(null); setMessages([]);
    getCharacterChatRooms(characterId).then(({ rooms: loadedRooms }) => {
      if (!active) return;
      setRooms(loadedRooms);
      setRoomsCharacterId(characterId);
      setSelectedRoomId(loadedRooms[0]?.id ?? null);
    }).catch((reason) => {
      if (active) {
        setRooms([]); setRoomsCharacterId(characterId); setSelectedRoomId(null); setMessages([]);
        setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as salas.');
      }
    }).finally(() => { if (active) setLoadingRooms(false); });
    return () => { active = false; };
  }, [characterId, reload]);

  useEffect(() => {
    if (!visibleRoomId) { setMessages([]); return; }
    let active = true;
    setLoadingMessages(true); setError(null); setMessages([]);
    getCharacterChatMessages(characterId, visibleRoomId).then(({ messages: loadedMessages }) => {
      if (active) setMessages(loadedMessages);
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as mensagens.');
    }).finally(() => { if (active) setLoadingMessages(false); });
    return () => { active = false; };
  }, [characterId, visibleRoomId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const roomId = visibleRoomId;
    const messageContent = content.trim();
    if (!roomId || !messageContent) return;
    const sentCharacterId = characterId;
    const key = `${sentCharacterId}:${roomId}`;
    const version = drafts.versions[key] ?? 0;
    setSending(true); setError(null);
    try {
      const { message } = await sendCharacterChatMessage(sentCharacterId, roomId, messageContent);
      if (currentContext.current.characterId === sentCharacterId && currentContext.current.roomId === roomId) {
        setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      }
      setDrafts((current) => clearCampaignChatDraftIfUnchanged(current, key, version));
    } catch (reason) {
      if (currentContext.current.characterId === sentCharacterId && currentContext.current.roomId === roomId) {
        setError(reason instanceof Error ? reason.message : 'Não foi possível enviar a mensagem.');
      }
    }
    finally { setSending(false); }
  }

  function changeDraft(value: string) {
    if (!draftKey) return;
    setDrafts((current) => updateCampaignChatDraft(current, draftKey, value));
  }

  function retryRooms() {
    setRooms([]); setRoomsCharacterId(null); setSelectedRoomId(null); setMessages([]);
    setReload((value) => value + 1);
  }

  return <CampaignChatPanel rooms={visibleRooms} selectedRoomId={visibleRoomId} messages={messages} characterId={characterId} content={content} loadingRooms={loadingRooms} loadingMessages={loadingMessages} sending={sending} error={error} onSelectRoom={setSelectedRoomId} onContentChange={changeDraft} onSubmit={(event) => void submit(event)} onRetry={retryRooms} />;
}
