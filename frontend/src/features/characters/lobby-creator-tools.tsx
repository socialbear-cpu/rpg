'use client';

import { useState, type FormEvent } from 'react';
import { createSystemChat, type GameSystem, type SystemLobbySettings } from '../../api';
import './lobby-creator-tools.css';

export function LobbyCreatorTools({ system, characterId, settings, onSettingsSaved, onChatCreated, onSystemSaved }: {
  system: GameSystem;
  characterId: string;
  settings: SystemLobbySettings;
  onChatCreated: (chatId: string) => void;
}) {
  const [chatName, setChatName] = useState('');
  const [chatDescription, setChatDescription] = useState('');
  const [savingChat, setSavingChat] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submitChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingChat(true); setMessage(''); setError('');
    try {
      const { chat } = await createSystemChat(system.id, { character_id: characterId, name: chatName, description: chatDescription || null });
      setChatName(''); setChatDescription(''); setMessage('Chat criado. A conversa está pronta para começar.');
      onChatCreated(chat.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível criar o chat.'); }
    finally { setSavingChat(false); }
  }

  return <section className="lobby-creator-tools" aria-labelledby="lobby-creator-tools-heading">
    <header><p className="character-entry-eyebrow">ÁREA DO OWNER</p><h2 id="lobby-creator-tools-heading">Ferramentas do criador</h2></header>
    <form className="lobby-creator-chat-form" onSubmit={(event) => void submitChat(event)}>
      <h3>Criar chat</h3>
      <label>Nome do chat<input required minLength={1} maxLength={80} value={chatName} onChange={(event) => setChatName(event.target.value)} /></label>
      <label>Descrição (opcional)<textarea maxLength={2000} value={chatDescription} onChange={(event) => setChatDescription(event.target.value)} /></label>
      <button type="submit" disabled={savingChat || !chatName.trim()}>{savingChat ? 'Criando…' : 'Criar chat'}</button>
    </form>
    {!settings.hidden_sections.includes('chat') && <a className="lobby-creator-chat-link" href="#chats-heading">Ver chats</a>}
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
