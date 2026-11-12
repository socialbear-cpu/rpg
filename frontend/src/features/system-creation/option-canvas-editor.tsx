'use client';

import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import type { CharacterSheetOption } from '../../api';

interface OptionDrag {
  index: number;
  pointerX: number;
  pointerY: number;
  x: number;
  y: number;
}

export function OptionCanvasEditor({ options, onChange }: { options: CharacterSheetOption[]; onChange: (options: CharacterSheetOption[]) => void }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const drag = useRef<OptionDrag | null>(null);

  function optionStyle(option: CharacterSheetOption, index: number): CSSProperties {
    const columns = Math.max(1, Math.ceil(Math.sqrt(options.length)));
    const width = 90 / columns;
    const height = 80 / Math.ceil(options.length / columns);
    return {
      left: `${option.x ?? 5 + (index % columns) * (width + 2)}%`,
      top: `${option.y ?? 5 + Math.floor(index / columns) * (height + 2)}%`,
      width: `${option.width ?? width}%`,
      height: `${option.height ?? height}%`,
      transform: `rotate(${option.rotation ?? 0}deg)`,
    };
  }

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!(event.target instanceof HTMLElement)) return;
    const target = event.target.closest<HTMLElement>('[data-option-index]');
    const index = Number(target?.dataset.optionIndex);
    const option = options[index];
    if (!target || !option) return;
    setSelectedIndex(index);
    drag.current = { index, pointerX: event.clientX, pointerY: event.clientY, x: option.x ?? 0, y: option.y ?? 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const currentDrag = drag.current;
    if (!currentDrag) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const option = options[currentDrag.index];
    if (!option || bounds.width <= 0 || bounds.height <= 0) return;
    const width = option.width ?? 30;
    const height = option.height ?? 30;
    const x = currentDrag.x + ((event.clientX - currentDrag.pointerX) / bounds.width) * 100;
    const y = currentDrag.y + ((event.clientY - currentDrag.pointerY) / bounds.height) * 100;
    onChange(options.map((item, index) => index === currentDrag.index ? {
      ...item,
      x: Math.max(0, Math.min(100 - width, x)),
      y: Math.max(0, Math.min(100 - height, y)),
    } : item));
  }

  return <div className="sheet-option-canvas-editor" aria-label="Posicione as opções visuais" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
    {options.map((option, index) => <div key={option.value ?? option.label} data-option-index={index} className={`sheet-option-canvas-item ${selectedIndex === index ? 'selected' : ''}`} style={optionStyle(option, index)} title={option.description}>
      {option.image_url ? <img src={option.image_url} alt="" draggable={false} /> : null}
      <strong>{option.label}</strong>
    </div>)}
  </div>;
}
