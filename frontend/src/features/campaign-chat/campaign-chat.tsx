'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createCharacterChatRoom, getCharacterChatCampaigns, getCharacterChatMessages, getCharacterChatRooms, sendCharacterChatMessage, type CampaignChatCampaign, type CampaignChatMessage, type CampaignChatRoom } from '../../api';
import { clearCampaignChatDraftIfUnchanged, emptyCampaignChatDrafts, roomsForCurrentCharacter, updateCampaignChatDraft } from './campaign-chat-state';
import './campaign-chat.css';

interface CampaignChatPanelProps {
  rooms: CampaignChatRoom[];
  campaigns: CampaignChatCampaign[];
  selectedRoomId: string | null;
  messages: CampaignChatMessage[];
  characterId: string;
  content: string;
  newRoomName: string;
  newRoomCampaignId: string;
  loadingRooms: boolean;
  loadingCampaigns: boolean;
  loadingMessages: boolean;
  sending: boolean;
  creatingRoom: boolean;
  error: string | null;
  onSelectRoom: (roomId: string) => void;
  onContentChange: (value: string) => void;
  onNewRoomNameChange: (value: string) => void;
  onNewRoomCampaignChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCreateRoom: (event: FormEvent<HTMLFormElement>) => void;
  onRetry?: () => void;
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export function CampaignChatPanel({ rooms, campaigns, selectedRoomId, messages, characterId, content, newRoomName, newRoomCampaignId, loadingRooms, loadingCampaigns, loadingMessages, sending, creatingRoom, error, onSelectRoom, onContentChange, onNewRoomNameChange, onNewRoomCampaignChange, onSubmit, onCreateRoom, onRetry }: CampaignChatPanelProps) {
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null;
  const creatableCampaigns = campaigns.filter((campaign) => campaign.can_create_room);
  return <section className="campaign-chat" aria-labelledby="campaign-chat-heading">
    <header className="lobby-section-heading"><div><span className="character-entry-eyebrow">CAMPANHAS DO PERSONAGEM</span><h2 id="campaign-chat-heading">Salas de bate-papo</h2></div></header>
    {loadingRooms || loadingCampaigns ? <p role="status">Carregando salas e campanhas…</p> : rooms.length === 0
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
    {creatableCampaigns.length > 0 && <form className="campaign-chat-create-room" aria-label="Criar sala" onSubmit={onCreateRoom}>
      <h3>Criar sala</h3>
      <label>Campanha
        <select aria-label="Campanha para nova sala" value={newRoomCampaignId} onChange={(event) => onNewRoomCampaignChange(event.target.value)} required>
          {creatableCampaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
        </select>
      </label>
      <label>Novo nome da sala
        <input value={newRoomName} onChange={(event) => onNewRoomNameChange(event.target.value)} minLength={1} maxLength={80} required />
      </label>
      <button type="submit" disabled={creatingRoom || !newRoomName.trim() || !newRoomCampaignId}>{creatingRoom ? 'Criando…' : 'Criar sala'}</button>
    </form>}
    {error && <p className="campaign-chat-error" role="alert">{error}{onRetry && <button type="button" onClick={onRetry}>Tentar novamente</button>}</p>}
  </section>;
}

export function CampaignChat({ characterId }: { characterId: string }) {
  const [rooms, setRooms] = useState<CampaignChatRoom[]>([]);
  const [roomsCharacterId, setRoomsCharacterId] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignChatCampaign[]>([]);
  const [campaignsCharacterId, setCampaignsCharacterId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CampaignChatMessage[]>([]);
  const [drafts, setDrafts] = useState(emptyCampaignChatDrafts);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomCampaignId, setNewRoomCampaignId] = useState('');
  const currentContext = useRef({ characterId, roomId: null as string | null });
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const visibleRooms = roomsForCurrentCharacter(rooms, roomsCharacterId, characterId);
  const visibleCampaigns = campaignsCharacterId === characterId ? campaigns : [];
  const visibleRoomId = roomsCharacterId === characterId ? selectedRoomId : null;
  const draftKey = visibleRoomId ? `${characterId}:${visibleRoomId}` : '';
  const content = draftKey ? drafts.values[draftKey] ?? '' : '';
  currentContext.current = { characterId, roomId: visibleRoomId };

  useEffect(() => {
    let active = true;
    setLoadingRooms(true); setLoadingCampaigns(true); setError(null); setRooms([]); setRoomsCharacterId(null); setCampaigns([]); setCampaignsCharacterId(null); setSelectedRoomId(null); setMessages([]);
    Promise.all([getCharacterChatRooms(characterId), getCharacterChatCampaigns(characterId)]).then(([{ rooms: loadedRooms }, { campaigns: loadedCampaigns }]) => {
      if (!active) return;
      setRooms(loadedRooms);
      setRoomsCharacterId(characterId);
      setCampaigns(loadedCampaigns);
      setCampaignsCharacterId(characterId);
      setNewRoomCampaignId((current) => loadedCampaigns.some((campaign) => campaign.id === current && campaign.can_create_room)
        ? current : loadedCampaigns.find((campaign) => campaign.can_create_room)?.id ?? '');
      setSelectedRoomId(loadedRooms[0]?.id ?? null);
    }).catch((reason) => {
      if (active) {
        setRooms([]); setRoomsCharacterId(characterId); setSelectedRoomId(null); setMessages([]);
        setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as salas.');
      }
    }).finally(() => { if (active) { setLoadingRooms(false); setLoadingCampaigns(false); } });
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

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedCharacterId = characterId;
    const campaignId = newRoomCampaignId;
    const name = newRoomName.trim();
    if (!campaignId || !name) return;
    setCreatingRoom(true); setError(null);
    try {
      const { room } = await createCharacterChatRoom(selectedCharacterId, campaignId, name);
      const { rooms: refreshedRooms } = await getCharacterChatRooms(selectedCharacterId);
      if (currentContext.current.characterId !== selectedCharacterId) return;
      setRooms(refreshedRooms);
      setRoomsCharacterId(selectedCharacterId);
      setSelectedRoomId(room.id);
      setNewRoomName((current) => current === name ? '' : current);
    } catch (reason) {
      if (currentContext.current.characterId === selectedCharacterId) {
        setError(reason instanceof Error ? reason.message : 'Não foi possível criar a sala.');
      }
    } finally { setCreatingRoom(false); }
  }

  function retryRooms() {
    setRooms([]); setRoomsCharacterId(null); setCampaigns([]); setCampaignsCharacterId(null); setSelectedRoomId(null); setMessages([]);
    setReload((value) => value + 1);
  }

  return <CampaignChatPanel rooms={visibleRooms} campaigns={visibleCampaigns} selectedRoomId={visibleRoomId} messages={messages} characterId={characterId} content={content} newRoomName={newRoomName} newRoomCampaignId={newRoomCampaignId} loadingRooms={loadingRooms} loadingCampaigns={loadingCampaigns} loadingMessages={loadingMessages} sending={sending} creatingRoom={creatingRoom} error={error} onSelectRoom={setSelectedRoomId} onContentChange={changeDraft} onNewRoomNameChange={setNewRoomName} onNewRoomCampaignChange={setNewRoomCampaignId} onSubmit={(event) => void submit(event)} onCreateRoom={(event) => void createRoom(event)} onRetry={retryRooms} />;
}
