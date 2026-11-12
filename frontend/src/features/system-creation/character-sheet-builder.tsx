'use client';

import { useRef, useState, type CSSProperties, type DragEvent, type PointerEvent } from 'react';
import type { CharacterSheetComponent, CharacterSheetDefinition, CharacterSheetVisualElement } from '../../api';
import { addSheetComponent, addSheetStep, addSheetVisualElement, moveSheetComponent, moveSheetComponentToStep, moveSheetStep, removeSheetComponent, removeSheetStep, removeSheetVisualElement } from './sheet-model';
import { CharacterSheetStepRenderer } from '../character-sheet/character-sheet-step-renderer';
import './system-creation.css';

interface VisualDrag {
  key: string;
  pointerX: number;
  pointerY: number;
  x: number;
  y: number;
}

export function CharacterSheetBuilder({ definition, onChange }: { definition: CharacterSheetDefinition; onChange: (definition: CharacterSheetDefinition) => void }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedElementKey, setSelectedElementKey] = useState<string | null>(null);
  const drag = useRef<VisualDrag | null>(null);
  const steps = definition.steps.slice().sort((a, b) => a.position - b.position);
  const stepIndex = Math.min(activeIndex, steps.length - 1);
  const step = steps[stepIndex]!;
  const elements = step.elements ?? [];
  const selectedElement = elements.find((element) => element.key === selectedElementKey);

  function patchComponent(componentKey: string, patch: Partial<CharacterSheetComponent>) {
    onChange({ ...definition, steps: definition.steps.map((item) => item.key === step.key ? { ...item, components: item.components.map((component) => component.key === componentKey ? { ...component, ...patch } as CharacterSheetComponent : component) } : item) });
  }

  function patchElement(elementKey: string, patch: Partial<CharacterSheetVisualElement>) {
    onChange({ ...definition, steps: definition.steps.map((item) => item.key === step.key ? { ...item, elements: (item.elements ?? []).map((element) => {
      if (element.key !== elementKey) return element;
      const updated = { ...element, ...patch } as CharacterSheetVisualElement;
      return { ...updated, x: Math.max(0, Math.min(100 - updated.width, updated.x)), y: Math.max(0, Math.min(100 - updated.height, updated.y)) };
    }) } : item) });
  }

  function changeType(component: CharacterSheetComponent, type: CharacterSheetComponent['type']) {
    const base = { key: component.key, label: component.label, required: component.required, position: component.position, width: component.width, show_on_card: component.show_on_card };
    const replacement: CharacterSheetComponent = type === 'single_select' ? { ...base, type, presentation: 'cards', options: [{ label: 'Opção 1' }] } : { ...base, type } as CharacterSheetComponent;
    patchComponent(component.key, replacement);
  }

  function addVisual(type: CharacterSheetVisualElement['type']) {
    const updated = addSheetVisualElement(definition, step.key, type);
    onChange(updated);
    setSelectedElementKey(updated.steps.find((item) => item.key === step.key)?.elements?.at(-1)?.key ?? null);
  }

  function handleCanvasPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!(event.target instanceof HTMLElement)) return;
    const element = event.target.closest<HTMLElement>('[data-visual-key]');
    if (!element || !event.currentTarget) {
      setSelectedElementKey(null);
      return;
    }
    const key = element.dataset.visualKey;
    const item = elements.find((candidate) => candidate.key === key);
    if (!key || !item) return;
    setSelectedElementKey(key);
    drag.current = { key, pointerX: event.clientX, pointerY: event.clientY, x: item.x, y: item.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleCanvasPointerMove(event: PointerEvent<HTMLDivElement>) {
    const activeDrag = drag.current;
    if (!activeDrag) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const item = elements.find((candidate) => candidate.key === activeDrag.key);
    if (!item || bounds.width <= 0 || bounds.height <= 0) return;
    const x = activeDrag.x + ((event.clientX - activeDrag.pointerX) / bounds.width) * 100;
    const y = activeDrag.y + ((event.clientY - activeDrag.pointerY) / bounds.height) * 100;
    patchElement(activeDrag.key, {
      x: Math.max(0, Math.min(100 - item.width, x)),
      y: Math.max(0, Math.min(100 - item.height, y)),
    });
  }

  function handleStepDrop(event: DragEvent<HTMLButtonElement>, targetStepKey: string, targetIndex: number) {
    event.preventDefault();
    const payload = event.dataTransfer.getData('application/json');
    if (!payload) return;
    try {
      const data = JSON.parse(payload) as { stepKey: string; componentKey: string };
      if (data.stepKey !== targetStepKey) {
        onChange(moveSheetComponentToStep(definition, data.stepKey, targetStepKey, data.componentKey));
        setActiveIndex(targetIndex);
      }
    } catch {
      return;
    }
  }

  return <section className="sheet-builder" aria-labelledby="sheet-builder-title">
    <div className="sheet-builder-heading"><div><span className="sheet-builder-eyebrow">FICHA DO PERSONAGEM</span><h2 id="sheet-builder-title">Monte a experiência de criação</h2><p>Edite cada etapa como uma página e organize os campos e elementos visuais.</p></div></div>
    <div className="sheet-built-in-field"><span className="sheet-field-number">01</span><div><strong>Nome do personagem</strong><span>Campo obrigatório incluído automaticamente</span></div><span className="sheet-required-badge">Obrigatório</span></div>

    <nav className="sheet-step-navigation" aria-label="Páginas da ficha">
      {steps.map((item, index) => <button key={item.key} type="button" className={index === stepIndex ? 'active' : ''} aria-current={index === stepIndex ? 'step' : undefined} onClick={() => setActiveIndex(index)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleStepDrop(event, item.key, index)}>
        <span>Etapa {index + 1}</span><strong>{item.label}</strong>
      </button>)}
      <button type="button" className="sheet-add-page-button" onClick={() => { const updated = addSheetStep(definition); onChange(updated); setActiveIndex(updated.steps.length - 1); }}>+ Adicionar etapa</button>
    </nav>

    <section className="visual-sheet-step" aria-label={`Etapa ${stepIndex + 1}: ${step.label}`}>
      <header><label>Etapa {stepIndex + 1}<input aria-label={`Nome da etapa ${stepIndex + 1}`} value={step.label} maxLength={80} onChange={(event) => onChange({ ...definition, steps: definition.steps.map((item) => item.key === step.key ? { ...item, label: event.target.value } : item) })} /></label><div className="sheet-field-actions"><button type="button" aria-label={`Mover etapa ${step.label} para cima`} disabled={stepIndex === 0} onClick={() => { onChange(moveSheetStep(definition, step.key, 'up')); setActiveIndex(stepIndex - 1); }}>↑</button><button type="button" aria-label={`Mover etapa ${step.label} para baixo`} disabled={stepIndex === steps.length - 1} onClick={() => { onChange(moveSheetStep(definition, step.key, 'down')); setActiveIndex(stepIndex + 1); }}>↓</button><button type="button" className="sheet-remove-button" disabled={steps.length === 1} onClick={() => { onChange(removeSheetStep(definition, step.key)); setActiveIndex(Math.max(0, stepIndex - 1)); }}>Remover etapa</button></div></header>

      <div className="visual-sheet-components">{step.components.slice().sort((a, b) => a.position - b.position).map((component, index) => <fieldset className="sheet-field-card" key={component.key} draggable onDragStart={(event) => event.dataTransfer.setData('application/json', JSON.stringify({ stepKey: step.key, componentKey: component.key }))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
        event.preventDefault();
        const payload = event.dataTransfer.getData('application/json');
        if (!payload) return;
        try {
          const data = JSON.parse(payload) as { stepKey: string; componentKey: string };
          if (data.stepKey === step.key) onChange(moveSheetComponent(definition, step.key, data.componentKey, index < component.position ? 'up' : 'down'));
        } catch {
          return;
        }
      }}>
        <legend className="sr-only">Componente {index + 1}</legend><div className="sheet-field-topline"><label className="sheet-field-label-control"><span>Nome do campo</span><input value={component.label} maxLength={80} onChange={(event) => patchComponent(component.key, { label: event.target.value })} /></label><label className="sheet-field-type-control"><span>Tipo</span><select value={component.type} onChange={(event) => changeType(component, event.target.value as CharacterSheetComponent['type'])}><option value="short_text">Texto curto</option><option value="long_text">Texto longo</option><option value="number">Número</option><option value="single_select">Escolha visual</option></select></label></div>
        <label className="sheet-field-type-control"><span>Largura</span><select value={component.width} onChange={(event) => patchComponent(component.key, { width: event.target.value as CharacterSheetComponent['width'] })}><option value="full">Linha inteira</option><option value="half">Metade</option><option value="third">Um terço</option></select></label>
        {component.type === 'single_select' && <><label className="sheet-field-type-control"><span>Apresentação</span><select value={component.presentation} onChange={(event) => patchComponent(component.key, { presentation: event.target.value as 'select' | 'cards' })}><option value="cards">Cards com imagem</option><option value="select">Lista simples</option></select></label><div className="visual-sheet-options">{component.options.map((option, optionIndex) => <fieldset key={optionIndex}><legend>Opção {optionIndex + 1}</legend><input aria-label={`Nome da opção ${optionIndex + 1}`} placeholder="Nome" value={option.label} onChange={(event) => patchComponent(component.key, { options: component.options.map((item, index) => index === optionIndex ? { ...item, label: event.target.value } : item) })} /><input aria-label={`Imagem da opção ${optionIndex + 1}`} placeholder="URL da imagem (HTTPS)" value={option.image_url ?? ''} onChange={(event) => patchComponent(component.key, { options: component.options.map((item, index) => index === optionIndex ? { ...item, image_url: event.target.value || undefined } : item) })} /><input aria-label={`Descrição da opção ${optionIndex + 1}`} placeholder="Descrição exibida ao passar o mouse" value={option.description ?? ''} onChange={(event) => patchComponent(component.key, { options: component.options.map((item, index) => index === optionIndex ? { ...item, description: event.target.value || undefined } : item) })} /><button type="button" onClick={() => patchComponent(component.key, { options: component.options.filter((_, index) => index !== optionIndex) })}>Remover opção</button></fieldset>)}<button type="button" onClick={() => patchComponent(component.key, { options: [...component.options, { label: `Opção ${component.options.length + 1}` }] })}>Adicionar opção</button></div></>}
        <div className="sheet-field-settings"><label className="sheet-checkbox"><input type="checkbox" checked={component.required} onChange={(event) => patchComponent(component.key, { required: event.target.checked })} /><span>Obrigatório</span></label><label className="sheet-checkbox"><input type="checkbox" checked={component.show_on_card} onChange={(event) => patchComponent(component.key, { show_on_card: event.target.checked })} /><span>Exibir na galeria</span></label><div className="sheet-field-actions"><button type="button" aria-label={`Mover campo ${component.label} para cima`} disabled={index === 0} onClick={() => onChange(moveSheetComponent(definition, step.key, component.key, 'up'))}>↑</button><button type="button" aria-label={`Mover campo ${component.label} para baixo`} disabled={index === step.components.length - 1} onClick={() => onChange(moveSheetComponent(definition, step.key, component.key, 'down'))}>↓</button><button type="button" className="sheet-remove-button" onClick={() => onChange(removeSheetComponent(definition, step.key, component.key))}>Remover</button></div></div>
      </fieldset>)}</div>
      <button type="button" className="sheet-add-button" onClick={() => onChange(addSheetComponent(definition, step.key))}>+ Adicionar componente</button>

      <section className="sheet-visual-editor" aria-label="Elementos visuais da etapa">
        <div className="sheet-visual-editor-heading"><div><h3>Imagens e textos livres</h3><p>Arraste para posicionar. Selecione um elemento para editar tamanho e rotação.</p></div><div className="sheet-visual-add-actions"><button type="button" onClick={() => addVisual('text')}>+ Texto</button><button type="button" onClick={() => addVisual('image')}>+ Imagem</button></div></div>
        <div className="sheet-visual-canvas" onPointerDown={handleCanvasPointerDown} onPointerMove={handleCanvasPointerMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
          {elements.map((element) => {
            const style: CSSProperties = { left: `${element.x}%`, top: `${element.y}%`, width: `${element.width}%`, height: `${element.height}%`, transform: `rotate(${element.rotation}deg)` };
            return <div key={element.key} data-visual-key={element.key} className={`sheet-visual-item ${element.key === selectedElementKey ? 'selected' : ''}`} style={style} title={element.type === 'image' ? element.description : undefined} onClick={() => setSelectedElementKey(element.key)}>
              {element.type === 'text' ? <span>{element.text}</span> : element.image_url ? <img src={element.image_url} alt={element.description || 'Imagem da ficha'} draggable={false} /> : <span>Adicione uma URL</span>}
            </div>;
          })}
        </div>
        {selectedElement && <div className="sheet-visual-controls">
          <strong>{selectedElement.type === 'text' ? 'Editar texto' : 'Editar imagem'}</strong>
          {selectedElement.type === 'text' ? <label>Texto<textarea maxLength={500} value={selectedElement.text} onChange={(event) => patchElement(selectedElement.key, { text: event.target.value })} /></label> : <>
            <label>URL da imagem (HTTPS)<input maxLength={2048} value={selectedElement.image_url} onChange={(event) => patchElement(selectedElement.key, { image_url: event.target.value })} /></label>
            <label>Descrição ao passar o mouse<input maxLength={500} value={selectedElement.description ?? ''} onChange={(event) => patchElement(selectedElement.key, { description: event.target.value || undefined })} /></label>
          </>}
          <label>Posição horizontal (%)<input type="number" min={0} max={100 - selectedElement.width} value={Number(selectedElement.x.toFixed(1))} onChange={(event) => patchElement(selectedElement.key, { x: Number(event.target.value) })} /></label>
          <label>Posição vertical (%)<input type="number" min={0} max={100 - selectedElement.height} value={Number(selectedElement.y.toFixed(1))} onChange={(event) => patchElement(selectedElement.key, { y: Number(event.target.value) })} /></label>
          <label>Largura (%)<input type="number" min={1} max={100} value={Number(selectedElement.width.toFixed(1))} onChange={(event) => patchElement(selectedElement.key, { width: Number(event.target.value) })} /></label>
          <label>Altura (%)<input type="number" min={1} max={100} value={Number(selectedElement.height.toFixed(1))} onChange={(event) => patchElement(selectedElement.key, { height: Number(event.target.value) })} /></label>
          <label>Rotação (graus)<input type="number" min={-360} max={360} value={Number(selectedElement.rotation.toFixed(1))} onChange={(event) => patchElement(selectedElement.key, { rotation: Number(event.target.value) })} /></label>
          <button type="button" className="sheet-remove-button" onClick={() => { onChange(removeSheetVisualElement(definition, step.key, selectedElement.key)); setSelectedElementKey(null); }}>Remover elemento</button>
        </div>}
      </section>

      <div className="visual-sheet-preview"><h3>Prévia para jogadores</h3><CharacterSheetStepRenderer step={step} values={{}} onValueChange={() => {}} mode="preview" /></div>
      <div className="sheet-page-actions"><button type="button" className="secondary-button" disabled={stepIndex === 0} onClick={() => setActiveIndex(stepIndex - 1)}>← Página anterior</button><span>Etapa {stepIndex + 1} de {steps.length}</span><button type="button" className="secondary-button" disabled={stepIndex === steps.length - 1} onClick={() => setActiveIndex(stepIndex + 1)}>Próxima página →</button></div>
    </section>
  </section>;
}
