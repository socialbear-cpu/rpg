'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { createSystemChat, type GameSystem, type SystemCharacter } from '../../api';
import './lobby-creator-tools.css';

export function LobbyCreatorTools({ system, characters, characterLoadError }: {
  system: GameSystem;
  characters: SystemCharacter[];
  characterLoadError: string | null;
}) {
  const [characterId, setCharacterId] = useState('');
  const [chatName, setChatName] = useState('');
  const [chatDescription, setChatDescription] = useState('');
  const [savingChat, setSavingChat] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setCharacterId((current) => characters.some((character) => character.id === current) ? current : characters[0]?.id ?? '');
  }, [characters]);

  async function submitChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!characterId) return;
    setSavingChat(true); setMessage(''); setError('');
    try {
      await createSystemChat(system.id, { character_id: characterId, name: chatName, description: chatDescription || null });
      setChatName(''); setChatDescription(''); setMessage('Chat criado. A conversa está pronta para começar.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível criar o chat.'); }
    finally { setSavingChat(false); }
  }

  return <section className="lobby-creator-tools" aria-labelledby="lobby-creator-tools-heading">
    <header><p className="character-entry-eyebrow">ÁREA DO OWNER</p><h2 id="lobby-creator-tools-heading">Ferramentas do criador</h2></header>
    {characterLoadError ? <p role="alert">{characterLoadError}</p> : characters.length === 0
      ? <p>Crie um personagem neste sistema antes de criar um chat.</p>
      : <form className="lobby-creator-chat-form" onSubmit={(event) => void submitChat(event)}>
        <h3>Criar chat</h3>
        <label>Personagem responsável pelo chat<select required value={characterId} onChange={(event) => setCharacterId(event.target.value)}>
          <option value="">Selecione um personagem</option>
          {characters.map((character) => <option key={character.id} value={character.id}>{character.character_name}</option>)}
        </select></label>
        <label>Nome do chat<input required minLength={1} maxLength={80} value={chatName} onChange={(event) => setChatName(event.target.value)} /></label>
        <label>Descrição (opcional)<textarea maxLength={2000} value={chatDescription} onChange={(event) => setChatDescription(event.target.value)} /></label>
        <button type="submit" disabled={savingChat || !characterId || !chatName.trim()}>{savingChat ? 'Criando…' : 'Criar chat'}</button>
      </form>}
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
