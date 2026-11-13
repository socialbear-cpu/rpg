'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import type { CharacterSheetComponent, CharacterSheetStep } from '../../api';
import { characterSheetOptionValue, getVisibleCharacterSheetOptions } from './conditions';

function optionLayout(component: Extract<CharacterSheetComponent, { type: 'single_select' }>, optionIndex: number): CSSProperties {
  const option = component.options[optionIndex]!;
  const columns = Math.max(1, Math.ceil(Math.sqrt(component.options.length)));
  const width = 90 / columns;
  const height = 80 / Math.ceil(component.options.length / columns);
  return {
    left: `${option.x ?? 5 + (optionIndex % columns) * (width + 2)}%`,
    top: `${option.y ?? 5 + Math.floor(optionIndex / columns) * (height + 2)}%`,
    width: `${option.width ?? width}%`,
    height: `${option.height ?? height}%`,
    transform: `rotate(${option.rotation ?? 0}deg)`,
  };
}

function isSelected(value: unknown, optionValue: string): boolean {
  return Array.isArray(value) ? value.includes(optionValue) : value === optionValue;
}

function CanvasChoiceOptions({ component, values, conditionValues, onValueChange, mode }: {
  component: Extract<CharacterSheetComponent, { type: 'single_select' }>;
  values: Record<string, unknown>;
  conditionValues: Record<string, unknown>;
  onValueChange: (key: string, value: unknown) => void;
  mode: 'preview' | 'entry';
}) {
  const options = getVisibleCharacterSheetOptions(component, conditionValues);
  const multiple = component.selection_mode === 'multiple';
  const currentValue = values[component.key];
  const selectedValues = Array.isArray(currentValue)
    ? currentValue.filter((item): item is string => typeof item === 'string')
    : typeof currentValue === 'string' ? [currentValue] : [];

  function selectOption(optionValue: string) {
    if (!multiple) {
      onValueChange(component.key, optionValue);
      return;
    }
    onValueChange(component.key, selectedValues.includes(optionValue)
      ? selectedValues.filter((item) => item !== optionValue)
      : [...selectedValues, optionValue]);
  }

  return <div className="character-sheet-canvas-choice-group" role={multiple ? 'group' : 'radiogroup'} aria-label={component.label} aria-required={component.required}>
    {options.map((option) => {
      const optionValue = characterSheetOptionValue(option);
      const selected = isSelected(values[component.key], optionValue);
      return <button key={optionValue} type="button" className={`character-sheet-canvas-option ${selected ? 'selected' : ''}`} role={multiple ? 'checkbox' : 'radio'} aria-checked={selected} aria-label={`${component.label}: ${option.label}${option.description ? `: ${option.description}` : ''}`} title={option.description} style={optionLayout(component, component.options.indexOf(option))} disabled={mode === 'preview'} onClick={() => selectOption(optionValue)}>
        {option.image_url ? <img src={option.image_url} alt="" draggable={false} /> : null}
        <strong>{option.label}</strong>
      </button>;
    })}
  </div>;
}

function CharacterSheetField({ component, values, conditionValues, onValueChange, mode }: {
  component: CharacterSheetComponent;
  values: Record<string, unknown>;
  conditionValues: Record<string, unknown>;
  onValueChange: (key: string, value: unknown) => void;
  mode: 'preview' | 'entry';
}) {
  const value = values[component.key];
  if (component.type === 'single_select') {
    const options = getVisibleCharacterSheetOptions(component, conditionValues);
    const multiple = component.selection_mode === 'multiple';
    const selectedValues = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : typeof value === 'string' ? [value] : [];
    function selectOption(optionValue: string) {
      if (!multiple) {
        onValueChange(component.key, optionValue);
        return;
      }
      onValueChange(component.key, selectedValues.includes(optionValue)
        ? selectedValues.filter((item) => item !== optionValue)
        : [...selectedValues, optionValue]);
    }

    if (component.presentation === 'cards') {
      return <div className="character-sheet-option-cards" role={multiple ? 'group' : 'radiogroup'} aria-label={component.label}>{options.map((option) => {
        const optionValue = characterSheetOptionValue(option);
        const selected = isSelected(value, optionValue);
        return <button key={optionValue} type="button" role={multiple ? 'checkbox' : 'radio'} aria-checked={selected} aria-label={`${option.label}${option.description ? `: ${option.description}` : ''}`} title={option.description} className={selected ? 'selected' : ''} disabled={mode === 'preview'} onClick={() => selectOption(optionValue)}>{option.image_url && <img src={option.image_url} alt="" title={option.description} loading="lazy" />}<strong>{option.label}</strong>{option.description && <span>{option.description}</span>}</button>;
      })}</div>;
    }

    return <select aria-label={component.label} multiple={multiple} value={multiple ? selectedValues : selectedValues[0] ?? ''} onChange={(event) => onValueChange(component.key, multiple ? [...event.currentTarget.selectedOptions].map((option) => option.value) : event.currentTarget.value)} disabled={mode === 'preview'}>
      {!multiple && <option value="">Escolha uma opção</option>}
      {options.map((option) => <option key={characterSheetOptionValue(option)} value={characterSheetOptionValue(option)} title={option.description}>{option.label}</option>)}
    </select>;
  }

  if (component.type === 'long_text') {
    return <textarea aria-label={component.label} value={String(value ?? '')} onChange={(event) => onValueChange(component.key, event.target.value)} disabled={mode === 'preview'} />;
  }
  return <input aria-label={component.label} type={component.type === 'number' ? 'number' : 'text'} value={String(value ?? '')} onChange={(event) => onValueChange(component.key, event.target.value)} disabled={mode === 'preview'} />;
}

export function CharacterSheetStepRenderer({ step, values, conditionValues = values, onValueChange, mode }: {
  step: CharacterSheetStep;
  values: Record<string, unknown>;
  conditionValues?: Record<string, unknown>;
  onValueChange: (key: string, value: unknown) => void;
  mode: 'preview' | 'entry';
}) {
  const elements = step.elements ?? [];
  const canvasComponents = step.components.filter((component): component is Extract<CharacterSheetComponent, { type: 'single_select' }> => component.type === 'single_select');
  const regularComponents = step.components.filter((component) => component.type !== 'single_select');
  const hasVisual = elements.length > 0 || canvasComponents.length > 0;
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setExpanded(false);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [expanded]);

  const visualStage = hasVisual ? <div className="character-sheet-visual-stage" aria-label="Composição visual da ficha">{elements.map((element) => <div key={element.key} className="character-sheet-visual-element" style={{ left: `${element.x}%`, top: `${element.y}%`, width: `${element.width}%`, height: `${element.height}%`, transform: `rotate(${element.rotation}deg)` }} title={element.type === 'image' ? element.description : undefined}>
      {element.type === 'text' ? element.text : <img src={element.image_url} alt={element.description || 'Imagem da ficha'} title={element.description} />}
    </div>)}
      {canvasComponents.map((component) => <CanvasChoiceOptions key={component.key} component={component} values={values} conditionValues={conditionValues} onValueChange={onValueChange} mode={mode} />)}
    </div> : null;

  return <>
    {hasVisual && (mode === 'entry'
      ? <section className={`character-sheet-visual-experience${expanded ? ' is-expanded' : ''}`} aria-label="Área visual da ficha">
        <div className="character-sheet-visual-toolbar">
          {canvasComponents.length > 0 && <div className="character-sheet-canvas-labels">{canvasComponents.map((component) => <span key={component.key}>{component.label}{component.required ? ' *' : ''}</span>)}</div>}
          <button type="button" className="character-sheet-visual-expand" aria-pressed={expanded} onClick={() => setExpanded((current) => !current)}>{expanded ? 'Reduzir composição' : 'Ampliar composição'}</button>
        </div>
        {visualStage}
      </section>
      : <>{canvasComponents.length > 0 && <div className="character-sheet-canvas-labels">{canvasComponents.map((component) => <span key={component.key}>{component.label}{component.required ? ' *' : ''}</span>)}</div>}{visualStage}</>)}
    <div className="character-sheet-step-grid">{regularComponents.slice().sort((a, b) => a.position - b.position).map((component) => <fieldset className={`character-sheet-component width-${component.width}`} key={component.key}>
      <legend>{component.label}{component.required ? ' *' : ''}</legend>
      <CharacterSheetField component={component} values={values} conditionValues={conditionValues} onValueChange={onValueChange} mode={mode} />
    </fieldset>)}</div>
  </>;
}
