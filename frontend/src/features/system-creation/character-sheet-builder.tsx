'use client';

import { useRef, useState, type CSSProperties, type DragEvent, type PointerEvent } from 'react';
import type { CharacterSheetComponent, CharacterSheetConditionGroup, CharacterSheetDefinition, CharacterSheetOption, CharacterSheetVisualElement } from '../../api';
import { addSheetComponent, addSheetStep, addSheetVisualElement, moveSheetComponent, moveSheetComponentToStep, moveSheetStep, removeSheetComponent, removeSheetStep, removeSheetVisualElement } from './sheet-model';
import { CharacterSheetStepRenderer } from '../character-sheet/character-sheet-step-renderer';
import { SheetConditionEditor } from './sheet-condition-editor';
import { OptionCanvasEditor } from './option-canvas-editor';
import './system-creation.css';

interface VisualDrag {
  key: string;
  pointerX: number;
  pointerY: number;
  x: number;
  y: number;
}

function previousComponents(definition: CharacterSheetDefinition, stepKey: string, componentKey?: string) {
  const result: CharacterSheetComponent[] = [];
  for (const step of definition.steps.slice().sort((a, b) => a.position - b.position)) {
    if (step.key === stepKey) {
      if (componentKey) result.push(...step.components.filter((component) => component.position < (step.components.find((item) => item.key === componentKey)?.position ?? -1)));
      break;
    }
    result.push(...step.components.slice().sort((a, b) => a.position - b.position));
  }
  return result;
}

function patchCondition(condition: CharacterSheetConditionGroup | undefined, sourceKey: string, oldValue: string, nextValue: string): CharacterSheetConditionGroup | undefined {
  if (!condition) return condition;
  return { ...condition, rules: condition.rules.map((rule) => rule.component_key === sourceKey && rule.value === oldValue ? { ...rule, value: nextValue } : rule) };
}

export function CharacterSheetBuilder({ definition, onChange }: { definition: CharacterSheetDefinition; onChange: (definition: CharacterSheetDefinition) => void }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedElementKey, setSelectedElementKey] = useState<string | null>(null);
  const [builderNotice, setBuilderNotice] = useState('');
  const drag = useRef<VisualDrag | null>(null);
  const steps = definition.steps.slice().sort((a, b) => a.position - b.position);
  const stepIndex = Math.min(activeIndex, steps.length - 1);
  const step = steps[stepIndex]!;
  const elements = step.elements ?? [];
  const selectedElement = elements.find((element) => element.key === selectedElementKey);

  function applyMove(updated: CharacterSheetDefinition) {
    if (updated === definition) {
      setBuilderNotice('Não foi possível mover: ajuste as dependências ou verifique o limite da etapa.');
      return;
    }
    setBuilderNotice('');
    onChange(updated);
  }

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

  function patchOption(componentKey: string, optionIndex: number, patch: Partial<CharacterSheetOption>) {
    const component = step.components.find((item) => item.key === componentKey);
    if (!component || component.type !== 'single_select') return;
    const oldOption = component.options[optionIndex];
    if (!oldOption) return;
    const updatedOption = { ...oldOption, ...patch };
    if (patch.label !== undefined && oldOption.value === undefined && patch.value === undefined) updatedOption.value = oldOption.label;
    const oldValue = oldOption.value ?? oldOption.label;
    const nextValue = updatedOption.value ?? updatedOption.label;
    let updatedDefinition: CharacterSheetDefinition = {
      ...definition,
      steps: definition.steps.map((item) => item.key === step.key ? {
        ...item,
        components: item.components.map((field) => field.key === componentKey && field.type === 'single_select'
          ? { ...field, options: field.options.map((option, index) => index === optionIndex ? updatedOption : option) }
          : field),
      } : item),
    };
    if (oldValue !== nextValue) {
      updatedDefinition = {
        ...updatedDefinition,
        steps: updatedDefinition.steps.map((item) => ({
          ...item,
          condition: patchCondition(item.condition, componentKey, oldValue, nextValue),
          components: item.components.map((field) => field.type === 'single_select'
            ? {
              ...field,
              condition: patchCondition(field.condition, componentKey, oldValue, nextValue),
              options: field.options.map((option) => ({ ...option, condition: patchCondition(option.condition, componentKey, oldValue, nextValue) })),
            }
            : { ...field, condition: patchCondition(field.condition, componentKey, oldValue, nextValue) }),
        })),
      };
    }
    onChange(updatedDefinition);
  }

  function addOption(componentKey: string) {
    const component = step.components.find((item) => item.key === componentKey);
    if (!component || component.type !== 'single_select') return;
    const index = component.options.length;
    const columns = 3;
    patchComponent(componentKey, {
      options: [...component.options, {
        label: `Opção ${index + 1}`,
        value: `option_${globalThis.crypto.randomUUID().replaceAll('-', '')}`,
        x: 5 + (index % columns) * 31,
        y: 5 + Math.floor(index / columns) * 41,
        width: 28,
        height: 35,
        rotation: 0,
      }],
    });
  }

  function removeOption(componentKey: string, optionIndex: number) {
    const component = step.components.find((item) => item.key === componentKey);
    if (!component || component.type !== 'single_select') return;
    const removed = component.options[optionIndex];
    if (!removed) return;
    const removedValue = removed.value ?? removed.label;
    const withoutRuleValue = (condition: CharacterSheetConditionGroup | undefined) => {
      if (!condition) return undefined;
      const rules = condition.rules.filter((rule) => rule.component_key !== componentKey || rule.value !== removedValue);
      return rules.length ? { ...condition, rules } : undefined;
    };
    let updated: CharacterSheetDefinition = {
      ...definition,
      steps: definition.steps.map((item) => ({
        ...item,
        condition: withoutRuleValue(item.condition),
        components: item.components.map((field) => field.type === 'single_select'
          ? {
            ...field,
            condition: withoutRuleValue(field.condition),
            options: field.options
              .filter((_, index) => field.key !== componentKey || index !== optionIndex)
              .map((option) => ({ ...option, condition: withoutRuleValue(option.condition) })),
          }
          : { ...field, condition: withoutRuleValue(field.condition) }),
      })),
    };
    updated = {
      ...updated,
      steps: updated.steps.map((item) => item.key === step.key ? {
        ...item,
        components: item.components.map((field) => field.key === componentKey && field.type === 'single_select'
          ? { ...field, options: field.options.filter((_, index) => index !== optionIndex) }
          : field),
      } : item),
    };
    onChange(updated);
  }

  function changeType(component: CharacterSheetComponent, type: CharacterSheetComponent['type']) {
    const base = { key: component.key, label: component.label, required: component.required, position: component.position, width: component.width, show_on_card: component.show_on_card, condition: component.condition };
    const replacement: CharacterSheetComponent = type === 'single_select' ? { ...base, type, presentation: 'cards', options: [{ label: 'Opção 1' }] } : { ...base, type } as CharacterSheetComponent;
    patchComponent(component.key, replacement);
  }

  function setPresentation(component: Extract<CharacterSheetComponent, { type: 'single_select' }>, presentation: 'select' | 'cards' | 'canvas') {
    const columns = Math.max(1, Math.ceil(Math.sqrt(component.options.length)));
    const width = 90 / columns;
    const rows = Math.ceil(component.options.length / columns);
    const height = 80 / rows;
    patchComponent(component.key, {
      presentation,
      options: component.options.map((option, index) => presentation === 'canvas' ? {
        ...option,
        x: option.x ?? 5 + (index % columns) * (width + 2),
        y: option.y ?? 5 + Math.floor(index / columns) * (height + 2),
        width: option.width ?? width,
        height: option.height ?? height,
        rotation: option.rotation ?? 0,
      } : option),
    });
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
        const updated = moveSheetComponentToStep(definition, data.stepKey, targetStepKey, data.componentKey);
        if (updated !== definition) setActiveIndex(targetIndex);
        applyMove(updated);
      }
    } catch {
      return;
    }
  }

  return <section className="sheet-builder" aria-labelledby="sheet-builder-title">
    <div className="sheet-builder-heading"><div><span className="sheet-builder-eyebrow">FICHA DO PERSONAGEM</span><h2 id="sheet-builder-title">Monte a experiência de criação</h2><p>Edite cada etapa como uma página e organize os campos e elementos visuais.</p></div></div>
    <div className="sheet-layout-selector"><label>Formato de criação<select value={definition.layout_mode ?? 'step_by_step'} onChange={(event) => onChange({ ...definition, layout_mode: event.target.value as 'single_page' | 'step_by_step' })}><option value="single_page">Todas as perguntas em uma única tela</option><option value="step_by_step">Uma pergunta por tela</option></select></label></div>
    <div className="sheet-built-in-field"><span className="sheet-field-number">01</span><div><strong>Nome do personagem</strong><span>Campo obrigatório incluído automaticamente</span></div><span className="sheet-required-badge">Obrigatório</span></div>

    <nav className="sheet-step-navigation" aria-label="Páginas da ficha">
      {steps.map((item, index) => <button key={item.key} type="button" className={index === stepIndex ? 'active' : ''} aria-current={index === stepIndex ? 'step' : undefined} onClick={() => setActiveIndex(index)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleStepDrop(event, item.key, index)}>
        <span>Etapa {index + 1}</span><strong>{item.label}</strong>
      </button>)}
      <button type="button" className="sheet-add-page-button" onClick={() => { const updated = addSheetStep(definition); onChange(updated); setActiveIndex(updated.steps.length - 1); }}>+ Adicionar etapa</button>
    </nav>

    <section className="visual-sheet-step" aria-label={`Etapa ${stepIndex + 1}: ${step.label}`}>
      <header><label>Etapa {stepIndex + 1}<input aria-label={`Nome da etapa ${stepIndex + 1}`} value={step.label} maxLength={80} onChange={(event) => onChange({ ...definition, steps: definition.steps.map((item) => item.key === step.key ? { ...item, label: event.target.value } : item) })} /></label><div className="sheet-field-actions"><button type="button" aria-label={`Mover etapa ${step.label} para cima`} disabled={stepIndex === 0} onClick={() => { const updated = moveSheetStep(definition, step.key, 'up'); applyMove(updated); if (updated !== definition) setActiveIndex(stepIndex - 1); }}>↑</button><button type="button" aria-label={`Mover etapa ${step.label} para baixo`} disabled={stepIndex === steps.length - 1} onClick={() => { const updated = moveSheetStep(definition, step.key, 'down'); applyMove(updated); if (updated !== definition) setActiveIndex(stepIndex + 1); }}>↓</button><button type="button" className="sheet-remove-button" disabled={steps.length === 1} onClick={() => { onChange(removeSheetStep(definition, step.key)); setActiveIndex(Math.max(0, stepIndex - 1)); }}>Remover etapa</button></div></header>
      {builderNotice && <p className="sheet-editor-notice" role="status">{builderNotice}</p>}
      <SheetConditionEditor label="Mostrar esta etapa quando" condition={step.condition} availableComponents={previousComponents(definition, step.key)} onChange={(condition) => onChange({ ...definition, steps: definition.steps.map((item) => item.key === step.key ? { ...item, condition } : item) })} />

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
      <legend className="sr-only">Componente {index + 1}</legend>
      <div className="sheet-field-topline">
        <label className="sheet-field-label-control"><span>Nome do campo</span><input value={component.label} maxLength={80} onChange={(event) => patchComponent(component.key, { label: event.target.value })} /></label>
        <label className="sheet-field-type-control"><span>Tipo</span><select value={component.type} onChange={(event) => changeType(component, event.target.value as CharacterSheetComponent['type'])}><option value="short_text">Texto curto</option><option value="long_text">Texto longo</option><option value="number">Número</option><option value="single_select">Escolha visual</option></select></label>
      </div>
      <label className="sheet-field-type-control"><span>Largura</span><select value={component.width} onChange={(event) => patchComponent(component.key, { width: event.target.value as CharacterSheetComponent['width'] })}><option value="full">Linha inteira</option><option value="half">Metade</option><option value="third">Um terço</option></select></label>
      {component.type === 'single_select' && <>
        <label className="sheet-field-type-control"><span>Apresentação</span><select value={component.presentation} onChange={(event) => setPresentation(component, event.target.value as 'select' | 'cards' | 'canvas')}><option value="cards">Cards com imagem</option><option value="select">Lista simples</option><option value="canvas">Imagens posicionadas livremente</option></select></label>
        <label className="sheet-field-type-control"><span>Tipo de seleção</span><select value={component.selection_mode ?? 'single'} onChange={(event) => patchComponent(component.key, { selection_mode: event.target.value as 'single' | 'multiple' })}><option value="single">Uma opção</option><option value="multiple">Várias opções</option></select></label>
        <div className="visual-sheet-options">
          {component.options.map((option, optionIndex) => <fieldset key={option.value ?? option.label}>
            <legend>Opção {optionIndex + 1}</legend>
            <label>Nome<input placeholder="Nome exibido" value={option.label} onChange={(event) => patchOption(component.key, optionIndex, { label: event.target.value })} /></label>
            <label>Valor salvo<input placeholder="Valor único" value={option.value ?? option.label} onChange={(event) => patchOption(component.key, optionIndex, { value: event.target.value })} /></label>
            <label>Imagem (HTTPS)<input placeholder="URL da imagem" value={option.image_url ?? ''} onChange={(event) => patchOption(component.key, optionIndex, { image_url: event.target.value || undefined })} /></label>
            <label>Descrição<input placeholder="Descrição ao passar o mouse" value={option.description ?? ''} onChange={(event) => patchOption(component.key, optionIndex, { description: event.target.value || undefined })} /></label>
            {component.presentation === 'canvas' && <div className="sheet-option-position-controls">
              <label>X (%)<input type="number" min={0} max={100 - (option.width ?? 30)} value={option.x ?? 0} onChange={(event) => patchOption(component.key, optionIndex, { x: Number(event.target.value) })} /></label>
              <label>Y (%)<input type="number" min={0} max={100 - (option.height ?? 30)} value={option.y ?? 0} onChange={(event) => patchOption(component.key, optionIndex, { y: Number(event.target.value) })} /></label>
              <label>Largura (%)<input type="number" min={1} max={100} value={option.width ?? 30} onChange={(event) => patchOption(component.key, optionIndex, { width: Number(event.target.value) })} /></label>
              <label>Altura (%)<input type="number" min={1} max={100} value={option.height ?? 30} onChange={(event) => patchOption(component.key, optionIndex, { height: Number(event.target.value) })} /></label>
              <label>Rotação<input type="number" min={-360} max={360} value={option.rotation ?? 0} onChange={(event) => patchOption(component.key, optionIndex, { rotation: Number(event.target.value) })} /></label>
            </div>}
            <SheetConditionEditor label="Disponível quando" condition={option.condition} availableComponents={previousComponents(definition, step.key, component.key)} onChange={(condition) => patchOption(component.key, optionIndex, { condition })} />
            <button type="button" onClick={() => removeOption(component.key, optionIndex)}>Remover opção</button>
          </fieldset>)}
          <button type="button" onClick={() => addOption(component.key)}>Adicionar opção</button>
        </div>
        {component.presentation === 'canvas' && <OptionCanvasEditor options={component.options} onChange={(options) => patchComponent(component.key, { options })} />}
      </>}
      <SheetConditionEditor label="Exibir este componente quando" condition={component.condition} availableComponents={previousComponents(definition, step.key, component.key)} onChange={(condition) => patchComponent(component.key, { condition })} />
      <div className="sheet-field-settings"><label className="sheet-checkbox"><input type="checkbox" checked={component.required} onChange={(event) => patchComponent(component.key, { required: event.target.checked })} /><span>Obrigatório</span></label><label className="sheet-checkbox"><input type="checkbox" checked={component.show_on_card} onChange={(event) => patchComponent(component.key, { show_on_card: event.target.checked })} /><span>Exibir na galeria</span></label><div className="sheet-field-actions"><button type="button" aria-label={`Mover campo ${component.label} para cima`} disabled={index === 0} onClick={() => applyMove(moveSheetComponent(definition, step.key, component.key, 'up'))}>↑</button><button type="button" aria-label={`Mover campo ${component.label} para baixo`} disabled={index === step.components.length - 1} onClick={() => applyMove(moveSheetComponent(definition, step.key, component.key, 'down'))}>↓</button><button type="button" className="sheet-remove-button" onClick={() => onChange(removeSheetComponent(definition, step.key, component.key))}>Remover</button></div></div>
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
