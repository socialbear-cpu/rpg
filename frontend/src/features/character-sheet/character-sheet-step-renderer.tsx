'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import type { CharacterSheetComponent, CharacterSheetStep, CharacterSheetVisualElement } from '../../api';
import { availableOptions, nextSelectionValue } from './conditions';
import { canvasChoiceCompositionKey } from './composition';
import { getCharacterSheetOptionLayout } from './visual-layout';

function isSelected(value: unknown, optionValue: string): boolean {
  return Array.isArray(value) ? value.includes(optionValue) : value === optionValue;
}

function selectedStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : typeof value === 'string' ? [value] : [];
}

function CanvasChoiceOptions({ component, values, onValueChange, mode }: {
  component: Extract<CharacterSheetComponent, { type: 'single_select' }>;
  values: Record<string, unknown>;
  onValueChange: (key: string, value: unknown) => void;
  mode: 'preview' | 'entry';
}) {
  const options = availableOptions(component, values);
  const optionIndexes = new Map(component.options.map((option, index) => [option, index]));
  const multiple = component.selection_mode === 'multiple';
  function selectOption(optionValue: string) {
    onValueChange(component.key, nextSelectionValue(values[component.key], optionValue, multiple));
  }
  return <div className="character-sheet-canvas-choice-group" role={multiple ? 'group' : 'radiogroup'} aria-label={component.label} aria-required={component.required}>
    {options.map((option, optionIndex) => {
      const optionValue = option.value ?? option.label;
      const selected = isSelected(values[component.key], optionValue);
      const layout = getCharacterSheetOptionLayout(option, optionIndexes.get(option) ?? optionIndex, component.options.length);
      const style: CSSProperties = { left: `${layout.x}%`, top: `${layout.y}%`, width: `${layout.width}%`, height: `${layout.height}%`, transform: `rotate(${option.rotation ?? 0}deg)` };
      return <button key={optionValue} type="button" className={`character-sheet-canvas-option ${selected ? 'selected' : ''}`} role={multiple ? 'checkbox' : 'radio'} aria-checked={selected} aria-label={`${component.label}: ${option.label}${option.description ? `: ${option.description}` : ''}`} title={option.description} style={style} disabled={mode === 'preview'} onClick={() => selectOption(optionValue)}>
        {option.image_url ? <img src={option.image_url} alt="" draggable={false} /> : null}<strong>{option.label}</strong>
      </button>;
    })}
  </div>;
}

function CharacterSheetField({ component, values, onValueChange, mode }: {
  component: Exclude<CharacterSheetComponent, { type: 'visual_composition' }>;
  values: Record<string, unknown>;
  onValueChange: (key: string, value: unknown) => void;
  mode: 'preview' | 'entry';
}) {
  const value = values[component.key];
  if (component.type === 'single_select') {
    const options = availableOptions(component, values);
    const multiple = component.selection_mode === 'multiple';
    const selectedValues = selectedStrings(value);
    function selectOption(optionValue: string) {
      onValueChange(component.key, nextSelectionValue(value, optionValue, multiple));
    }
    if (component.presentation === 'cards') {
      return <div className="character-sheet-option-cards" role={multiple ? 'group' : 'radiogroup'} aria-label={component.label}>{options.map((option) => {
        const optionValue = option.value ?? option.label;
        const selected = isSelected(value, optionValue);
        return <button key={optionValue} type="button" role={multiple ? 'checkbox' : 'radio'} aria-checked={selected} aria-label={`${option.label}${option.description ? `: ${option.description}` : ''}`} title={option.description} className={selected ? 'selected' : ''} disabled={mode === 'preview'} onClick={() => selectOption(optionValue)}>{option.image_url && <img src={option.image_url} alt="" title={option.description} loading="lazy" />}<strong>{option.label}</strong>{option.description && <span>{option.description}</span>}</button>;
      })}</div>;
    }
    return <select aria-label={component.label} multiple={multiple} value={multiple ? selectedValues : selectedValues[0] ?? ''} onChange={(event) => onValueChange(component.key, multiple ? [...event.currentTarget.selectedOptions].map((option) => option.value) : event.currentTarget.value)} disabled={mode === 'preview' || options.length === 0}>
      {!multiple && <option value="">{options.length === 0 ? 'Escolha primeiro uma opção anterior' : 'Escolha uma opção'}</option>}
      {options.map((option) => <option key={option.value ?? option.label} value={option.value ?? option.label} title={option.description}>{option.label}</option>)}
    </select>;
  }
  if (component.type === 'long_text') return <textarea aria-label={component.label} value={String(value ?? '')} onChange={(event) => onValueChange(component.key, event.target.value)} disabled={mode === 'preview'} />;
  return <input aria-label={component.label} type={component.type === 'number' ? 'number' : 'text'} value={String(value ?? '')} onChange={(event) => onValueChange(component.key, event.target.value)} disabled={mode === 'preview'} />;
}

function VisualElement({ element }: { element: CharacterSheetVisualElement }) {
  return <div className="character-sheet-visual-element" style={{ left: `${element.x}%`, top: `${element.y}%`, width: `${element.width}%`, height: `${element.height}%`, transform: `rotate(${element.rotation}deg)` }} title={element.type === 'image' ? element.description : undefined}>
    {element.type === 'text' ? element.text : <img src={element.image_url} alt={element.description || 'Imagem da ficha'} title={element.description} />}
  </div>;
}

export function CharacterSheetStepRenderer({ step, values, onValueChange, mode }: {
  step: CharacterSheetStep;
  values: Record<string, unknown>;
  onValueChange: (key: string, value: unknown) => void;
  mode: 'preview' | 'entry';
}) {
  const elements = step.elements ?? [];
  const canvasComponents = step.components.filter((component): component is Extract<CharacterSheetComponent, { type: 'single_select' }> => component.type === 'single_select' && component.presentation === 'canvas');
  const visualComponents = step.components.filter((component): component is Extract<CharacterSheetComponent, { type: 'visual_composition' }> => component.type === 'visual_composition').sort((a, b) => a.position - b.position);
  const linkedCompositions = new Set(visualComponents.map((component) => component.composition_key));
  const compositionGroups = [...new Set(elements.map((element) => element.composition_key ?? 'composition_1'))];
  const legacyCompositionGroups = compositionGroups.filter((key) => !linkedCompositions.has(key));
  const regularComponents = step.components.filter((component) => component.type !== 'single_select' || component.presentation !== 'canvas').sort((a, b) => a.position - b.position);
  const [expandedComposition, setExpandedComposition] = useState<string | null>(null);

  useEffect(() => {
    if (!expandedComposition) return;
    function closeOnEscape(event: KeyboardEvent) { if (event.key === 'Escape') setExpandedComposition(null); }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [expandedComposition]);

  function renderCanvasChoiceLabels(compositionKey: string) {
    const choices = canvasComponents.filter((component) => canvasChoiceCompositionKey(step, component) === compositionKey);
    return choices.length > 0 && <div className="character-sheet-canvas-labels">{choices.map((component) => <span key={component.key}>{component.label}{component.required ? ' *' : ''}</span>)}</div>;
  }

  function renderComposition(compositionKey: string, key?: string) {
    return <div key={key} className="character-sheet-visual-stage" aria-label="Composição visual da ficha">
      {elements.filter((element) => (element.composition_key ?? 'composition_1') === compositionKey).map((element) => <VisualElement key={element.key} element={element} />)}
      {canvasComponents.filter((component) => canvasChoiceCompositionKey(step, component) === compositionKey).map((component) => <CanvasChoiceOptions key={component.key} component={component} values={values} onValueChange={onValueChange} mode={mode} />)}
    </div>;
  }

  const visualStageKeys = legacyCompositionGroups.length > 0 ? legacyCompositionGroups : canvasComponents.length > 0 && visualComponents.length === 0 ? ['composition_1'] : [];
  const visualStage = visualStageKeys.length > 0 ? <>{visualStageKeys.map((key) => <div key={key}>{renderCanvasChoiceLabels(key)}{renderComposition(key)}</div>)}</> : null;

  return <>
    {visualStage && (mode === 'entry'
      ? <section className={`character-sheet-visual-experience${expandedComposition === 'legacy' ? ' is-expanded' : ''}`} aria-label="Área visual da ficha">
        <div className="character-sheet-visual-toolbar">
          <button type="button" className="character-sheet-visual-expand" aria-pressed={expandedComposition === 'legacy'} onClick={() => setExpandedComposition((current) => current === 'legacy' ? null : 'legacy')}>{expandedComposition === 'legacy' ? 'Reduzir composição' : 'Ampliar composição'}</button>
        </div>{visualStage}
      </section>
      : visualStage)}
    <div className="character-sheet-step-grid">{regularComponents.map((component) => component.type === 'visual_composition'
      ? <section className={`character-sheet-visual-component width-${component.width}`} key={component.key} aria-label={component.label}>
        <div className={`character-sheet-visual-experience${expandedComposition === component.key ? ' is-expanded' : ''}`}>
          <div className="character-sheet-visual-toolbar">
            {renderCanvasChoiceLabels(component.composition_key)}
            <h3>{component.label}</h3>
            {mode === 'entry' && <button type="button" className="character-sheet-visual-expand" aria-pressed={expandedComposition === component.key} onClick={() => setExpandedComposition((current) => current === component.key ? null : component.key)}>{expandedComposition === component.key ? 'Reduzir composição' : 'Ampliar composição'}</button>}
          </div>
          {renderComposition(component.composition_key)}
        </div>
      </section>
      : <fieldset className={`character-sheet-component width-${component.width}`} key={component.key}>
        <legend>{component.label}{component.required ? ' *' : ''}</legend>
        <CharacterSheetField component={component} values={values} onValueChange={onValueChange} mode={mode} />
      </fieldset>)}</div>
  </>;
}
