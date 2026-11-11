'use client';

import type { CharacterSheetField, SystemCharacter } from '../../api';
import './characters.css';

interface CharacterHomeProps {
  systemName: string;
  character: SystemCharacter | null;
  fields: CharacterSheetField[];
  onSwitch: () => void;
}

export function CharacterHome({ systemName, character, fields, onSwitch }: CharacterHomeProps) {
  if (!character) return <main className="character-entry-page"><section className="character-unavailable"><span className="character-entry-eyebrow">{systemName}</span><h1>Personagem indisponível</h1><p>Este personagem não está disponível neste sistema.</p><button type="button" className="character-primary-button" onClick={onSwitch}>Voltar aos personagens</button></section></main>;
  const cardFields = [...fields].filter((field) => field.show_on_card).sort((a, b) => a.position - b.position);
  return (
    <main className="character-entry-page character-home-page">
      <span className="character-entry-eyebrow">{systemName}</span>
      <div className="character-home-card"><div className="character-card-avatar" aria-hidden="true">{character.character_name.slice(0, 1).toUpperCase()}</div><span className="character-card-system">PERSONAGEM ATIVO</span><h1>{character.character_name}</h1>
        {cardFields.length > 0 && <dl className="character-home-fields">{cardFields.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{String(character.attributes[field.key] ?? '—')}</dd></div>)}</dl>}
        <button type="button" className="character-secondary-button" onClick={onSwitch}>Trocar personagem</button>
      </div>
    </main>
  );
}
