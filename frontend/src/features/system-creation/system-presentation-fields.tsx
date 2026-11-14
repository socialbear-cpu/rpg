'use client';

import { useEffect, useRef, useState } from 'react';
import { getGameSystemTagOptions, type GameSystemPlayMode, type SystemTagOption } from '../../api';

const maximumTags = 5;

export function SystemPresentationFields({
  playMode,
  tags,
  imagePreviewUrl,
  focusX,
  focusY,
  onPlayModeChange,
  onTagsChange,
  onImageChange,
  onRemoveImage,
  onFocusXChange,
  onFocusYChange,
}: {
  playMode: GameSystemPlayMode | '';
  tags: string[];
  imagePreviewUrl: string | null;
  focusX: number;
  focusY: number;
  onPlayModeChange: (mode: GameSystemPlayMode) => void;
  onTagsChange: (tags: string[]) => void;
  onImageChange: (file: File | null) => void;
  onRemoveImage: () => void;
  onFocusXChange: (value: number) => void;
  onFocusYChange: (value: number) => void;
}) {
  const [tagOptions, setTagOptions] = useState<SystemTagOption[]>([]);
  const [tagError, setTagError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    getGameSystemTagOptions()
      .then(({ tags: options }) => { if (active) setTagOptions(options); })
      .catch(() => { if (active) setTagError('Não foi possível carregar as etiquetas disponíveis.'); });
    return () => { active = false; };
  }, []);

  function toggleTag(slug: string) {
    if (tags.includes(slug)) {
      onTagsChange(tags.filter((tag) => tag !== slug));
    } else if (tags.length < maximumTags) {
      onTagsChange([...tags, slug]);
    }
  }

  function removeImage() {
    if (fileInput.current) fileInput.current.value = '';
    onRemoveImage();
  }

  return <section className="system-presentation-fields" aria-label="Apresentação do sistema">
    <fieldset className="system-presentation-mode">
      <legend>Modalidade principal</legend>
      <p>Indique como as sessões deste RPG acontecem principalmente.</p>
      <div>
        <label><input type="radio" name="game-system-play-mode" value="text" checked={playMode === 'text'} onChange={() => onPlayModeChange('text')} /> Texto</label>
        <label><input type="radio" name="game-system-play-mode" value="voice" checked={playMode === 'voice'} onChange={() => onPlayModeChange('voice')} /> Voz</label>
      </div>
    </fieldset>

    <fieldset className="system-presentation-tags">
      <legend>Etiquetas <span>(até {maximumTags})</span></legend>
      <p>Escolha os temas e estilos que descrevem seu RPG.</p>
      {tagError ? <p className="systems-error" role="alert">{tagError}</p> : tagOptions.length === 0
        ? <p role="status">Carregando etiquetas…</p>
        : <div className="system-tag-options">
          {tagOptions.map((option) => {
            const selected = tags.includes(option.slug);
            return <button key={option.slug} type="button" className={selected ? 'system-tag-option is-selected' : 'system-tag-option'} aria-pressed={selected} disabled={!selected && tags.length >= maximumTags} onClick={() => toggleTag(option.slug)}>
              {selected ? '✓ ' : ''}{option.label}
            </button>;
          })}
        </div>}
      <small>{tags.length}/{maximumTags} selecionadas</small>
    </fieldset>

    <div className="system-presentation-cover">
      <label className="system-creation-label">Imagem do sistema <span>(opcional, até 5 MB)</span>
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => onImageChange(event.target.files?.[0] ?? null)} />
      </label>
      {imagePreviewUrl
        ? <div className="system-cover-preview">
          <img src={imagePreviewUrl} alt="Prévia da imagem do sistema" style={{ objectPosition: `${focusX}% ${focusY}%` }} />
          <button type="button" className="secondary-button" onClick={removeImage}>Remover imagem</button>
          <label className="system-cover-focus">Ajustar enquadramento horizontal
            <input type="range" min="0" max="100" value={focusX} onChange={(event) => onFocusXChange(Number(event.target.value))} />
          </label>
          <label className="system-cover-focus">Ajustar enquadramento vertical
            <input type="range" min="0" max="100" value={focusY} onChange={(event) => onFocusYChange(Number(event.target.value))} />
          </label>
        </div>
        : <p className="system-cover-empty">Nenhuma imagem escolhida. Será usada a arte padrão da plataforma.</p>}
    </div>
  </section>;
}
