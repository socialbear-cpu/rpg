'use client';

import type { RefObject } from 'react';
import type { CharacterExperienceSummary, CharacterSheetField, SystemCharacter } from '../../api';
import { formatCharacterSheetValue } from '../character-sheet/format-value';

export interface CharacterSheetPreview {
  systemName: string;
  character: SystemCharacter;
  fields: CharacterSheetField[];
  experience: CharacterExperienceSummary | null;
}

export function CharacterMenu({ preview, menuRef, onOpenSheet, onSwitch }: {
  preview: CharacterSheetPreview;
  menuRef: RefObject<HTMLDetailsElement | null>;
  onOpenSheet?: () => void;
  onSwitch?: () => void;
}) {
  const { character, fields, experience, systemName } = preview;
  const requiredXp = experience ? experience.xp_in_level + experience.xp_to_next_level : null;
  const progress = requiredXp && experience ? Math.min(100, experience.xp_in_level / requiredXp * 100) : 0;

  function run(action: () => void) {
    if (menuRef.current) {
      menuRef.current.open = false;
      menuRef.current.querySelector('summary')?.focus();
    }
    action();
  }

  return <details className="app-header-character-menu" ref={menuRef}>
    <summary className="app-header-character-trigger" aria-label="Abrir menu do personagem">Personagem <span className="app-header-character-current">{character.character_name}</span><span aria-hidden="true">⌄</span></summary>
    <section className="app-header-character-popover" aria-label="Personagem e ficha">
      <section className="app-header-character-sheet" aria-label="Ficha completa do personagem">
        <div className="app-header-sheet-heading"><span>SUA FICHA</span><span>{systemName}</span></div>
        <h2>{character.character_name}</h2>
        <div className="app-header-sheet-level">Nível {experience?.level ?? '—'}</div>
        <div className="app-header-sheet-xp">
          <div><span>Experiência</span><strong>{experience ? `${experience.total_xp} XP` : '—'}</strong></div>
          <div className="app-header-sheet-xp-track" role="progressbar" aria-label="Progresso para o próximo nível" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></div>
          <div className="app-header-sheet-xp-caption"><span>{experience && requiredXp !== null ? `${experience.xp_in_level} / ${requiredXp} XP` : 'Progresso indisponível'}</span>{experience && <span>Faltam {experience.xp_to_next_level} XP</span>}</div>
        </div>
        <dl className="app-header-sheet-fields">{fields.map(field => <div key={field.key}><dt>{field.label}</dt><dd>{formatCharacterSheetValue(field, character.attributes[field.key])}</dd></div>)}</dl>
      </section>
      {(onOpenSheet || onSwitch) && <div className="app-header-character-actions">
        {onOpenSheet && <button type="button" onClick={() => run(onOpenSheet)}>Abrir ficha completa</button>}
        {onSwitch && <button type="button" onClick={() => run(onSwitch)}>Trocar personagem</button>}
      </div>}
    </section>
  </details>;
}
