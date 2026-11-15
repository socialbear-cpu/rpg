'use client';

import { useEffect, useState } from 'react';
import type { CharacterSheetField, SystemCharacter } from '../../api';
import { formatCharacterSheetValue } from '../character-sheet/format-value';
import { AppHeader } from '../shell/app-header';
import './characters.css';

interface CharacterGalleryProps {
  systemName: string;
  fields: CharacterSheetField[];
  characters: SystemCharacter[];
  selectedCharacterId?: string | null;
  experienceByCharacterId?: Record<string, number>;
  onCreate: () => void;
  onEnter: (characterId: string) => void;
  onConfigureLobby?: () => void;
}

const characterRunes = ['ᚨ', 'ᛉ', 'ᚱ', 'ᚠ', 'ᛟ', 'ᛞ', 'ᛃ', 'ᛇ'] as const;

function characterRune(characterId: string) {
  const runeIndex = [...characterId].reduce((sum, character) => sum + character.charCodeAt(0), 0) % characterRunes.length;
  return characterRunes[runeIndex];
}

export function CharacterGallery({ systemName, fields, characters, selectedCharacterId = null, experienceByCharacterId = {}, onCreate, onEnter, onConfigureLobby }: CharacterGalleryProps) {
  const cardFields = [...fields].filter((field) => field.show_on_card).sort((a, b) => a.position - b.position);
  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 5;
  const pageCount = Math.ceil(characters.length / pageSize);
  const pageCharacters = characters.slice(currentPage * pageSize, currentPage * pageSize + pageSize);

  useEffect(() => setCurrentPage(0), [characters]);

  return (
    <main className="character-entry-page character-gallery-page">
      <AppHeader activeItem="Meus Sistemas" backHref="/dashboard" backLabel="Meus sistemas" />
      <header className="character-entry-heading character-gallery-heading">
        <div><span className="character-entry-eyebrow">ᚷ &nbsp; {systemName} · O destino chama &nbsp; ᚷ</span><h1>Escolha seu aventureiro</h1><p>Quem seguirá para a próxima aventura?</p></div>
        {onConfigureLobby && <button className="character-gallery-owner-button" type="button" onClick={onConfigureLobby}><span aria-hidden="true">⚙</span> Personalizar saguão</button>}
      </header>
      <section className="character-carousel" aria-label="Personagens">
        {currentPage > 0 && <button className="character-carousel-control character-carousel-previous" type="button" aria-label="Mostrar personagens anteriores" aria-controls="character-gallery-cards" onClick={() => setCurrentPage((page) => page - 1)}>‹</button>}
        <div className="character-grid" id="character-gallery-cards" aria-live="polite">
          {pageCharacters.map((character) => {
            const cardField = cardFields.find((field) => {
              const value = formatCharacterSheetValue(field, character.attributes[field.key]);
              return value !== '—' && value.trim() !== '';
            });
            return (
              <article className={`character-card ${selectedCharacterId === character.id ? 'character-card-selected' : ''}`} key={character.id}>
                <span className="character-card-rune" aria-hidden="true">{characterRune(character.id)}</span>
                {cardField && <p className="character-card-detail"><span className="character-card-detail-label">{cardField.label}</span><span className="character-card-detail-value">{formatCharacterSheetValue(cardField, character.attributes[cardField.key])}</span></p>}
                <h2>{character.character_name}</h2>
                {experienceByCharacterId[character.id] !== undefined && <span className="character-card-level">Nível {experienceByCharacterId[character.id]}</span>}
                <button className="character-portal-button" type="button" aria-label={`Entrar com ${character.character_name}`} onClick={() => onEnter(character.id)}>
                  <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12" /><ellipse cx="16" cy="16" rx="7" ry="10" /><path d="M16 1.5v3M16 27.5v3M1.5 16h3M27.5 16h3M2.8 5.8l2.1 2.1M27.2 5.8l-2.1 2.1M2.8 26.2l2.1-2.1M27.2 26.2l-2.1-2.1M5 16h11m0 0-3-3m3 3-3 3" /></svg>
                </button>
              </article>
            );
          })}
          {pageCharacters.length < 3 && <div className="character-card character-card-placeholder" aria-hidden="true" />}
        </div>
        {currentPage < pageCount - 1 && <button className="character-carousel-control character-carousel-next" type="button" aria-label="Mostrar próximos personagens" aria-controls="character-gallery-cards" onClick={() => setCurrentPage((page) => page + 1)}>›</button>}
      </section>
      <footer className="character-gallery-footer">
        <div className="character-gallery-footer-content">
          <button className="character-gallery-create" type="button" onClick={onCreate}><span aria-hidden="true">＋</span> Criar novo personagem</button>
          <p>᛫ &nbsp; Cada jornada começa com uma escolha &nbsp; ᛫</p>
        </div>
      </footer>
    </main>
  );
}
