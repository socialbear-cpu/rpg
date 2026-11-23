'use client';

import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import type { CharacterSheetComponent, CharacterSheetDefinition, CharacterSheetOption, CharacterSheetVisualElement } from '../../api';
import { activeSheetCompositionKey, canvasChoiceCompositionKey, sheetCompositionKeys } from '../character-sheet/composition';
import { addSheetChoiceComponent, addSheetComponent, addSheetComposition, addSheetVisualElement, moveSheetComponent, removeSheetComponent, removeSheetComposition, removeSheetVisualElement } from './sheet-model';
import { CharacterSheetStepRenderer } from '../character-sheet/character-sheet-step-renderer';
import { getCharacterSheetOptionLayout } from '../character-sheet/visual-layout';
import './system-creation.css';

type VisualDrag = (
  | { kind: 'element'; key: string }
  | { kind: 'option'; componentKey: string; optionIndex: number }
) & {
  pointerX: number;
  pointerY: number;
  x: number;
  y: number;
};

export function CharacterSheetBuilder({ definition, onChange }: { definition: CharacterSheetDefinition; onChange: (definition: CharacterSheetDefinition) => void }) {
  const [selectedElement, setSelectedElement] = useState<{ key: string; stepKey: string } | null>(null);
  const [selectedOptionKey, setSelectedOptionKey] = useState<{ componentKey: string; optionIndex: number } | null>(null);
  const [activeCompositionByStep, setActiveCompositionByStep] = useState<Record<string, string>>({});
  const [builderNotice, setBuilderNotice] = useState('');
  const drag = useRef<VisualDrag | null>(null);
  const steps = definition.steps.slice().sort((a, b) => a.position - b.position);
  const activeCompositionForStep = (step: CharacterSheetDefinition['steps'][number]) => activeSheetCompositionKey(step, activeCompositionByStep[step.key]);
  const selectedElementData = selectedElement && steps.find((item) => item.key === selectedElement.stepKey)?.elements?.find((element) => element.key === selectedElement.key);
  const selectedOptionComponent = selectedOptionKey ? steps.flatMap((item) => item.components).find((component) => component.key === selectedOptionKey.componentKey) : null;
  const selectedOption = selectedOptionComponent?.type === 'single_select' ? selectedOptionComponent.options[selectedOptionKey!.optionIndex] : undefined;

  function clearInvalidChoiceConditions(source: CharacterSheetDefinition) {
    const priorChoices = new Map<string, Set<string>>();
    let changed = false;
    const byStep = new Map<string, CharacterSheetDefinition['steps'][number]['components']>();
    for (const step of source.steps.slice().sort((a, b) => a.position - b.position)) {
      const components = step.components.slice().sort((a, b) => a.position - b.position).map((component) => {
        if (component.type !== 'single_select') return component;
        const options = component.options.map((option) => {
          if (!option.condition || option.condition.rules.every((rule) => {
            const values = priorChoices.get(rule.component_key);
            return values !== undefined && (rule.value === undefined || values.has(rule.value));
          })) return option;
          changed = true;
          return { ...option, condition: undefined };
        });
        priorChoices.set(component.key, new Set(component.options.map((option) => option.value ?? option.label)));
        return options.some((option, index) => option !== component.options[index]) ? { ...component, options } : component;
      });
      byStep.set(step.key, components);
    }
    return {
      definition: { ...source, steps: source.steps.map((step) => ({ ...step, components: byStep.get(step.key) ?? step.components })) },
      changed,
    };
  }

  function applyMove(updated: CharacterSheetDefinition) {
    if (updated === definition) {
      setBuilderNotice('Não foi possível mover: verifique o limite de campos.');
      return;
    }

    const cleaned = clearInvalidChoiceConditions(updated);
    setBuilderNotice(cleaned.changed ? 'A dependência foi removida porque a escolha de origem ficou depois desta lista.' : '');
    onChange(cleaned.definition);
  }

  function patchComponent(componentKey: string, patch: Partial<CharacterSheetComponent>) {
    onChange({ ...definition, steps: definition.steps.map((item) => ({ ...item, components: item.components.map((component) => component.key === componentKey ? { ...component, ...patch } as CharacterSheetComponent : component) })) });
  }

  function patchElement(elementKey: string, patch: Partial<CharacterSheetVisualElement>) {
    onChange({ ...definition, steps: definition.steps.map((item) => ({ ...item, elements: (item.elements ?? []).map((element) => {
      if (element.key !== elementKey) return element;
      const updated = { ...element, ...patch } as CharacterSheetVisualElement;
      return { ...updated, x: Math.max(0, Math.min(100 - updated.width, updated.x)), y: Math.max(0, Math.min(100 - updated.height, updated.y)) };
    }) })) });
  }

  function patchOption(componentKey: string, optionIndex: number, patch: Partial<CharacterSheetOption>) {
    const component = steps.flatMap((item) => item.components).find((item) => item.key === componentKey);
    if (!component || component.type !== 'single_select') return;
    const oldOption = component.options[optionIndex];
    if (!oldOption) return;
    const updatedOption = { ...oldOption, ...patch };
    if (patch.label !== undefined && oldOption.value === undefined && patch.value === undefined) updatedOption.value = oldOption.label;
    const updatedDefinition: CharacterSheetDefinition = {
      ...definition,
      steps: definition.steps.map((item) => ({
        ...item,
        components: item.components.map((field) => field.key === componentKey && field.type === 'single_select'
          ? { ...field, options: field.options.map((option, index) => index === optionIndex ? updatedOption : option) }
          : field),
      })),
    };
    const cleaned = clearInvalidChoiceConditions(updatedDefinition);
    if (cleaned.changed) setBuilderNotice('A dependência foi removida porque a opção de origem não está mais disponível.');
    onChange(cleaned.definition);
  }

  function addOption(componentKey: string) {
    const component = steps.flatMap((item) => item.components).find((item) => item.key === componentKey);
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
    setSelectedOptionKey({ componentKey, optionIndex: index });
  }

  function addChoiceGroup(stepKey: string, compositionKey = activeCompositionByStep[stepKey] ?? 'composition_1') {
    const key = `field_${globalThis.crypto.randomUUID().replaceAll('-', '')}`;
    const component: Extract<CharacterSheetComponent, { type: 'single_select' }> = {
      key,
      label: 'Nova escolha',
      type: 'single_select',
      presentation: 'canvas',
      composition_key: compositionKey,
      selection_mode: 'single',
      options: [{ label: 'Opção 1', value: `option_${globalThis.crypto.randomUUID().replaceAll('-', '')}`, x: 5, y: 5, width: 28, height: 35, rotation: 0 }],
      required: false,
      position: (definition.steps.find((item) => item.key === stepKey)?.components.length ?? 0),
      width: 'full',
      show_on_card: false,
    };
    onChange({ ...definition, steps: definition.steps.map((item) => item.key === stepKey ? { ...item, components: [...item.components, component] } : item) });
    setSelectedElement(null);
    setSelectedOptionKey({ componentKey: key, optionIndex: 0 });
  }

  function removeOption(componentKey: string, optionIndex: number) {
    const component = steps.flatMap((item) => item.components).find((item) => item.key === componentKey);
    if (!component || component.type !== 'single_select') return;
    if (!component.options[optionIndex]) return;
    const ownerStepKey = steps.find((item) => item.components.some((field) => field.key === componentKey))?.key;
    const updated: CharacterSheetDefinition = {
      ...definition,
      steps: definition.steps.map((item) => item.key === ownerStepKey ? {
        ...item,
        components: item.components.map((field) => field.key === componentKey && field.type === 'single_select'
          ? { ...field, options: field.options.filter((_, index) => index !== optionIndex) }
          : field),
      } : item),
    };
    const cleaned = clearInvalidChoiceConditions(updated);
    if (cleaned.changed) setBuilderNotice('A dependência foi removida porque a opção de origem foi excluída.');
    onChange(cleaned.definition);
  }

  function changeType(component: CharacterSheetComponent, type: 'short_text' | 'long_text' | 'number') {
    const base = { key: component.key, label: component.label, required: component.required, position: component.position, width: component.width, show_on_card: component.show_on_card };
    const replacement: CharacterSheetComponent = { ...base, type };
    const updated: CharacterSheetDefinition = { ...definition, steps: definition.steps.map((item) => ({ ...item, components: item.components.map((field) => field.key === component.key ? replacement : field) })) };
    const cleaned = clearInvalidChoiceConditions(updated);
    if (cleaned.changed) setBuilderNotice('A dependência foi removida porque o campo deixou de ser uma lista de opções.');
    onChange(cleaned.definition);
  }

  function addVisual(stepKey: string, type: CharacterSheetVisualElement['type'], compositionKey = activeCompositionByStep[stepKey] ?? 'composition_1') {
    const updated = addSheetVisualElement(definition, stepKey, type, compositionKey);
    onChange(updated);
    const key = updated.steps.find((item) => item.key === stepKey)?.elements?.at(-1)?.key;
    setSelectedElement(key ? { key, stepKey } : null);
    setSelectedOptionKey(null);
  }

  function addComposition(stepKey: string) {
    const result = addSheetComposition(definition, stepKey);
    if (!result.compositionKey) return;
    onChange(result.definition);
    setActiveCompositionByStep((current) => ({ ...current, [stepKey]: result.compositionKey }));
    const key = result.definition.steps.find((item) => item.key === stepKey)?.elements?.at(-1)?.key;
    setSelectedElement(key ? { key, stepKey } : null);
    setSelectedOptionKey(null);
  }

  function addListOption(component: Extract<CharacterSheetComponent, { type: 'single_select' }>) {
    const index = component.options.length;
    patchComponent(component.key, { options: [...component.options, { label: `Opção ${index + 1}`, value: `option_${globalThis.crypto.randomUUID().replaceAll('-', '')}` }] });
  }

  function priorChoiceComponents(componentKey: string) {
    const ordered = steps.flatMap((item) => item.components.slice().sort((a, b) => a.position - b.position));
    const index = ordered.findIndex((field) => field.key === componentKey);
    return ordered.slice(0, index).filter((field) => field.type === 'single_select');
  }

  function setOptionCondition(componentKey: string, optionIndex: number, encoded: string) {
    if (!encoded) {
      patchOption(componentKey, optionIndex, { condition: undefined });
      return;
    }
    try {
      const rule = JSON.parse(encoded) as { component_key: string; value: string };
      patchOption(componentKey, optionIndex, { condition: { logic: 'all', rules: [{ component_key: rule.component_key, operator: 'equals', value: rule.value }] } });
    } catch { return; }
  }

  function removeComponent(stepKey: string, component: CharacterSheetComponent) {
    const updated = component.type === 'visual_composition'
      ? removeSheetComposition(definition, stepKey, component.key)
      : removeSheetComponent(definition, stepKey, component.key);
    const cleaned = clearInvalidChoiceConditions(updated);
    if (cleaned.changed) setBuilderNotice('A dependência de uma lista foi removida porque o campo de origem foi excluído.');
    onChange(cleaned.definition);
  }

  function handleCanvasPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!(event.target instanceof HTMLElement)) return;
    const target = event.target.closest<HTMLElement>('[data-visual-key], [data-option-component-key]');
    if (!target || !event.currentTarget) {
      setSelectedElement(null);
      setSelectedOptionKey(null);
      return;
    }
    const visualKey = target.dataset.visualKey;
    if (visualKey) {
      const owner = steps.find((stepItem) => stepItem.elements?.some((candidate) => candidate.key === visualKey));
      const item = owner?.elements?.find((candidate) => candidate.key === visualKey);
      if (!item || !owner) return;
      setSelectedElement({ key: visualKey, stepKey: owner.key });
      setSelectedOptionKey(null);
      drag.current = { kind: 'element', key: visualKey, pointerX: event.clientX, pointerY: event.clientY, x: item.x, y: item.y };
    } else {
      const componentKey = target.dataset.optionComponentKey;
      const optionIndex = Number(target.dataset.optionIndex);
      const component = steps.flatMap((stepItem) => stepItem.components).find((candidate) => candidate.key === componentKey);
      if (!componentKey || !component || component.type !== 'single_select') return;
      const option = component.options[optionIndex];
      if (!option) return;
      const position = getCharacterSheetOptionLayout(option, optionIndex, component.options.length);
      setSelectedElement(null);
      setSelectedOptionKey({ componentKey, optionIndex });
      drag.current = { kind: 'option', componentKey, optionIndex, pointerX: event.clientX, pointerY: event.clientY, x: position.x, y: position.y };
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleCanvasPointerMove(event: PointerEvent<HTMLDivElement>) {
    const activeDrag = drag.current;
    if (!activeDrag) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const x = activeDrag.x + ((event.clientX - activeDrag.pointerX) / bounds.width) * 100;
    const y = activeDrag.y + ((event.clientY - activeDrag.pointerY) / bounds.height) * 100;
    if (activeDrag.kind === 'element') {
      const item = steps.flatMap((stepItem) => stepItem.elements ?? []).find((candidate) => candidate.key === activeDrag.key);
      if (!item) return;
      patchElement(activeDrag.key, {
        x: Math.max(0, Math.min(100 - item.width, x)),
        y: Math.max(0, Math.min(100 - item.height, y)),
      });
      return;
    }
    const component = steps.flatMap((stepItem) => stepItem.components).find((candidate) => candidate.key === activeDrag.componentKey);
    if (!component || component.type !== 'single_select') return;
    const option = component.options[activeDrag.optionIndex];
    if (!option) return;
    const position = getCharacterSheetOptionLayout(option, activeDrag.optionIndex, component.options.length);
    patchOption(activeDrag.componentKey, activeDrag.optionIndex, {
      x: Math.max(0, Math.min(100 - position.width, x)),
      y: Math.max(0, Math.min(100 - position.height, y)),
    });
  }

  return <section className="sheet-builder" aria-labelledby="sheet-builder-title">
    <div className="sheet-builder-heading"><div><span className="sheet-builder-eyebrow">FICHA DO PERSONAGEM</span><h2 id="sheet-builder-title">Monte a experiência de criação</h2><p>Organize os campos e elementos visuais da ficha.</p></div></div>
    <p className="sheet-editor-description">Todos os campos serão exibidos juntos em uma única ficha.</p>
    <div className="sheet-built-in-field"><span className="sheet-field-number">01</span><div><strong>Nome do personagem</strong><span>Campo obrigatório incluído automaticamente</span></div><span className="sheet-required-badge">Obrigatório</span></div>

    {steps.map((step) => <div className="sheet-page-content" key={step.key}>
      {builderNotice && <p className="sheet-editor-notice" role="status">{builderNotice}</p>}

      <div className="visual-sheet-components">{step.components.filter((component) => component.type !== 'single_select' || component.presentation !== 'canvas').slice().sort((a, b) => a.position - b.position).map((component, index) => <fieldset className="sheet-field-card" key={component.key} draggable onDragStart={(event) => event.dataTransfer.setData('application/json', JSON.stringify({ stepKey: step.key, componentKey: component.key }))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
        event.preventDefault();
        const payload = event.dataTransfer.getData('application/json');
        if (!payload) return;
        try {
          const data = JSON.parse(payload) as { stepKey: string; componentKey: string };
          const draggedComponent = step.components.find((field) => field.key === data.componentKey);
          if (data.stepKey === step.key && draggedComponent && draggedComponent.position !== component.position) applyMove(moveSheetComponent(definition, step.key, data.componentKey, draggedComponent.position < component.position ? 'down' : 'up'));
        } catch {
          return;
        }
      }}>
      <legend className="sr-only">Componente {index + 1}</legend>
      <div className="sheet-field-topline">
        <label className="sheet-field-label-control"><span>Nome do campo</span><input value={component.label} maxLength={80} onChange={(event) => patchComponent(component.key, { label: event.target.value })} /></label>
        {component.type === 'visual_composition' ? <span className="sheet-component-kind">Composição visual</span> : component.type === 'single_select' ? <span className="sheet-component-kind">Lista de opções</span> : <label className="sheet-field-type-control"><span>Tipo</span><select value={component.type} onChange={(event) => changeType(component, event.target.value as 'short_text' | 'long_text' | 'number')}><option value="short_text">Texto curto</option><option value="long_text">Texto longo</option><option value="number">Número</option></select></label>}
      </div>
      {component.type !== 'visual_composition' && <label className="sheet-field-type-control"><span>Largura</span><select value={component.width} onChange={(event) => patchComponent(component.key, { width: event.target.value as CharacterSheetComponent['width'] })}><option value="full">Linha inteira</option><option value="half">Metade</option><option value="third">Um terço</option></select></label>}
      {component.type === 'single_select' && component.presentation === 'select' && <div className="sheet-list-options-editor"><strong>Opções disponíveis</strong>{component.options.map((option, optionIndex) => {
        const sourceComponents = priorChoiceComponents(component.key);
        const selectedSource = option.condition?.rules[0];
        const dependency = selectedSource?.value === undefined ? '' : JSON.stringify({ component_key: selectedSource.component_key, value: selectedSource.value });
        return <div className="sheet-list-option-row" key={`${component.key}-${optionIndex}`}>
          <label>Opção {optionIndex + 1}<input maxLength={80} value={option.label} onChange={(event) => patchOption(component.key, optionIndex, { label: event.target.value })} /></label>
          <label>Mostrar quando<select value={dependency} onChange={(event) => setOptionCondition(component.key, optionIndex, event.target.value)}><option value="">Sempre disponível</option>{sourceComponents.flatMap((source) => source.type === 'single_select' ? source.options.map((sourceOption) => <option key={`${source.key}:${sourceOption.value ?? sourceOption.label}`} value={JSON.stringify({ component_key: source.key, value: sourceOption.value ?? sourceOption.label })}>{source.label}: {sourceOption.label}</option>) : [])}</select></label>
          <button type="button" className="sheet-remove-button" disabled={component.options.length <= 1} onClick={() => removeOption(component.key, optionIndex)}>Remover</button>
        </div>;
      })}<button type="button" onClick={() => addListOption(component)}>+ Adicionar opção</button></div>}
      {component.type === 'visual_composition' && <p className="sheet-composition-hint">Edite textos, imagens e escolhas no canvas abaixo. Esta composição aparece aqui na ficha do jogador.</p>}
      <div className="sheet-field-settings">
        {component.type !== 'visual_composition' && <>
          <label className="sheet-checkbox"><input type="checkbox" checked={component.required} onChange={(event) => patchComponent(component.key, { required: event.target.checked })} /><span>Obrigatório</span></label>
          <label className="sheet-checkbox"><input type="checkbox" checked={component.show_on_card} onChange={(event) => patchComponent(component.key, { show_on_card: event.target.checked })} /><span>Exibir na galeria</span></label>
        </>}
        <div className="sheet-field-actions">
          <button type="button" aria-label={`Mover campo ${component.label} para cima`} disabled={component.position === 0} onClick={() => applyMove(moveSheetComponent(definition, step.key, component.key, 'up'))}>↑</button>
          <button type="button" aria-label={`Mover campo ${component.label} para baixo`} disabled={component.position === step.components.length - 1} onClick={() => applyMove(moveSheetComponent(definition, step.key, component.key, 'down'))}>↓</button>
          <button type="button" className="sheet-remove-button" onClick={() => removeComponent(step.key, component)}>Remover</button>
        </div>
      </div>
      </fieldset>)}</div>
      <div className="sheet-add-component-actions"><button type="button" className="sheet-add-button" onClick={() => onChange(addSheetComponent(definition, step.key))}>+ Campo de texto</button><button type="button" className="sheet-add-button" onClick={() => onChange(addSheetChoiceComponent(definition, step.key))}>+ Lista de opções</button><button type="button" className="sheet-add-button" onClick={() => addComposition(step.key)}>+ Composição visual</button></div>

      <section className="sheet-visual-editor" aria-label="Composição visual da ficha">
        <div className="sheet-visual-editor-heading"><div><h3>Editor visual</h3><p>Selecione um elemento no canvas para editar ou arraste-o para posicionar.</p></div></div>
        {(() => {
          const compositions = sheetCompositionKeys(step);
          const activeComposition = activeCompositionForStep(step);
          const compositionElements = (step.elements ?? []).filter((element) => (element.composition_key ?? 'composition_1') === activeComposition);
          return <>
        {compositions.length > 1 && <div className="sheet-step-navigation" role="tablist" aria-label="Composições visuais">{compositions.map((key, index) => { const composition = step.components.find((component) => component.type === 'visual_composition' && component.composition_key === key); return <button key={key} type="button" role="tab" aria-selected={activeComposition === key} className="bifrost-tab" onClick={() => { setActiveCompositionByStep((current) => ({ ...current, [step.key]: key })); setSelectedElement(null); setSelectedOptionKey(null); }}>{composition?.label.trim() || `Composição ${index + 1}`}</button>; })}</div>}
        <div className="sheet-visual-add-actions"><button type="button" onClick={() => addChoiceGroup(step.key, activeComposition)}>+ Escolha visual</button><button type="button" onClick={() => addVisual(step.key, 'text', activeComposition)}>+ Texto</button><button type="button" onClick={() => addVisual(step.key, 'image', activeComposition)}>+ Imagem</button></div>
        <div className="sheet-visual-canvas" onPointerDown={handleCanvasPointerDown} onPointerMove={handleCanvasPointerMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
          {compositionElements.map((element) => {
            const style: CSSProperties = { left: `${element.x}%`, top: `${element.y}%`, width: `${element.width}%`, height: `${element.height}%`, transform: `rotate(${element.rotation}deg)` };
            return <div key={element.key} data-visual-key={element.key} className={`sheet-visual-item ${element.key === selectedElement?.key ? 'selected' : ''}`} style={style} title={element.type === 'image' ? element.description : undefined} onClick={() => setSelectedElement({ key: element.key, stepKey: step.key })}>
              {element.type === 'text' ? <span>{element.text}</span> : element.image_url ? <img src={element.image_url} alt={element.description || 'Imagem da ficha'} draggable={false} /> : <span>Adicione uma URL</span>}
            </div>;
          })}
          {step.components.filter((component) => component.type === 'single_select' && component.presentation === 'canvas' && canvasChoiceCompositionKey(step, component) === activeComposition).flatMap((component) => component.type === 'single_select' ? component.options.map((option, optionIndex) => {
            const position = getCharacterSheetOptionLayout(option, optionIndex, component.options.length);
            const style: CSSProperties = { left: `${position.x}%`, top: `${position.y}%`, width: `${position.width}%`, height: `${position.height}%`, transform: `rotate(${option.rotation ?? 0}deg)` };
            return <div key={`${component.key}:${option.value ?? option.label}`} data-option-component-key={component.key} data-option-index={optionIndex} className={`sheet-option-canvas-item ${selectedOptionKey?.componentKey === component.key && selectedOptionKey.optionIndex === optionIndex ? 'selected' : ''}`} style={style} title={option.description}>
              {option.image_url ? <img src={option.image_url} alt="" draggable={false} /> : null}
              <strong>{option.label}</strong>
            </div>;
          }) : [])}
        </div>
          </>;
        })()}
        {selectedOption && selectedOptionComponent?.type === 'single_select' ? <div className="sheet-visual-controls sheet-option-visual-controls">
          <strong>Editar opção · {selectedOptionComponent.label}</strong>
          <label>Nome<input maxLength={80} value={selectedOption.label} onChange={(event) => patchOption(selectedOptionComponent.key, selectedOptionKey!.optionIndex, { label: event.target.value })} /></label>
          <label>Valor salvo<input maxLength={120} value={selectedOption.value ?? selectedOption.label} onChange={(event) => patchOption(selectedOptionComponent.key, selectedOptionKey!.optionIndex, { value: event.target.value })} /></label>
          <label>Imagem (HTTPS)<input maxLength={2048} value={selectedOption.image_url ?? ''} onChange={(event) => patchOption(selectedOptionComponent.key, selectedOptionKey!.optionIndex, { image_url: event.target.value || undefined })} /></label>
          <label>Descrição<input maxLength={500} value={selectedOption.description ?? ''} onChange={(event) => patchOption(selectedOptionComponent.key, selectedOptionKey!.optionIndex, { description: event.target.value || undefined })} /></label>
          <div className="sheet-option-transform-controls">
            <label>Largura (%)<input type="number" min={1} max={100} value={selectedOption.width ?? 30} onChange={(event) => patchOption(selectedOptionComponent.key, selectedOptionKey!.optionIndex, { width: Number(event.target.value) })} /></label>
            <label>Altura (%)<input type="number" min={1} max={100} value={selectedOption.height ?? 30} onChange={(event) => patchOption(selectedOptionComponent.key, selectedOptionKey!.optionIndex, { height: Number(event.target.value) })} /></label>
            <label>Rotação<input type="number" min={-360} max={360} value={selectedOption.rotation ?? 0} onChange={(event) => patchOption(selectedOptionComponent.key, selectedOptionKey!.optionIndex, { rotation: Number(event.target.value) })} /></label>
          </div>
          <button type="button" className="sheet-remove-button" disabled={selectedOptionComponent.options.length <= 1} onClick={() => { removeOption(selectedOptionComponent.key, selectedOptionKey!.optionIndex); setSelectedOptionKey(null); }}>Remover opção</button>
        </div> : selectedElementData && selectedElement?.stepKey === step.key && <div className="sheet-visual-controls">
          <strong>{selectedElementData.type === 'text' ? 'Editar texto' : 'Editar imagem'}</strong>
          {selectedElementData.type === 'text' ? <label>Texto<textarea maxLength={500} value={selectedElementData.text} onChange={(event) => patchElement(selectedElementData.key, { text: event.target.value })} /></label> : <>
            <label>URL da imagem (HTTPS)<input maxLength={2048} value={selectedElementData.image_url} onChange={(event) => patchElement(selectedElementData.key, { image_url: event.target.value })} /></label>
            <label>Descrição ao passar o mouse<input maxLength={500} value={selectedElementData.description ?? ''} onChange={(event) => patchElement(selectedElementData.key, { description: event.target.value || undefined })} /></label>
          </>}
          <label>Posição horizontal (%)<input type="number" min={0} max={100 - selectedElementData.width} value={Number(selectedElementData.x.toFixed(1))} onChange={(event) => patchElement(selectedElementData.key, { x: Number(event.target.value) })} /></label>
          <label>Posição vertical (%)<input type="number" min={0} max={100 - selectedElementData.height} value={Number(selectedElementData.y.toFixed(1))} onChange={(event) => patchElement(selectedElementData.key, { y: Number(event.target.value) })} /></label>
          <label>Largura (%)<input type="number" min={1} max={100} value={Number(selectedElementData.width.toFixed(1))} onChange={(event) => patchElement(selectedElementData.key, { width: Number(event.target.value) })} /></label>
          <label>Altura (%)<input type="number" min={1} max={100} value={Number(selectedElementData.height.toFixed(1))} onChange={(event) => patchElement(selectedElementData.key, { height: Number(event.target.value) })} /></label>
          <label>Rotação (graus)<input type="number" min={-360} max={360} value={Number(selectedElementData.rotation.toFixed(1))} onChange={(event) => patchElement(selectedElementData.key, { rotation: Number(event.target.value) })} /></label>
          <button type="button" className="sheet-remove-button" onClick={() => { onChange(removeSheetVisualElement(definition, step.key, selectedElementData.key)); setSelectedElement(null); }}>Remover elemento</button>
        </div>}
        {step.components.filter((component): component is Extract<CharacterSheetComponent, { type: 'single_select' }> => component.type === 'single_select' && component.presentation === 'canvas' && canvasChoiceCompositionKey(step, component) === activeCompositionForStep(step)).map((component) => <fieldset className="sheet-canvas-choice-group-editor" key={component.key}>
          <legend>Grupo de escolha</legend>
          <label>Nome da escolha<input maxLength={80} value={component.label} onChange={(event) => patchComponent(component.key, { label: event.target.value })} /></label>
          <label>Seleção<select value={component.selection_mode ?? 'single'} onChange={(event) => patchComponent(component.key, { selection_mode: event.target.value as 'single' | 'multiple' })}><option value="single">Uma opção</option><option value="multiple">Várias opções</option></select></label>
          <label className="sheet-checkbox"><input type="checkbox" checked={component.required} onChange={(event) => patchComponent(component.key, { required: event.target.checked })} /><span>Obrigatório</span></label>
          <label className="sheet-checkbox"><input type="checkbox" checked={component.show_on_card} onChange={(event) => patchComponent(component.key, { show_on_card: event.target.checked })} /><span>Exibir na galeria</span></label>
          <button type="button" onClick={() => addOption(component.key)}>+ Adicionar opção</button>
          <button type="button" className="sheet-remove-button" onClick={() => { removeComponent(step.key, component); setSelectedOptionKey(null); }}>Remover escolha</button>
        </fieldset>)}
      </section>

    </div>)}
    <div className="visual-sheet-preview"><h3>Prévia completa para jogadores</h3>{steps.map((step) => <CharacterSheetStepRenderer key={step.key} step={step} values={{}} onValueChange={() => {}} mode="preview" />)}</div>
  </section>;
}
