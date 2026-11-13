'use client';

import { useState, type FormEvent } from 'react';
import type { CharacterSheetComponent, CharacterSheetDefinition, CharacterSheetStep } from '../../api';
import { characterSheetOptionValue, getVisibleCharacterSheetOptions, resolveVisibleCharacterSheetComponents } from '../character-sheet/conditions';
import { CharacterSheetStepRenderer } from '../character-sheet/character-sheet-step-renderer';
import './characters.css';

interface CharacterFormProps {
  definition: CharacterSheetDefinition;
  initialName?: string;
  initialAttributes?: Record<string, unknown>;
  submitLabel?: string;
  error?: string | null;
  saving?: boolean;
  systemIsPublic?: boolean;
  onSubmit: (characterName: string, attributes: Record<string, unknown>, systemPassword?: string) => void;
  onCancel: () => void;
}

type CreationPage =
  | { key: 'character_name'; kind: 'name' }
  | { key: string; kind: 'component'; step: CharacterSheetStep; component: CharacterSheetComponent }
  | { key: 'summary'; kind: 'summary' };

function isFilled(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && String(value).trim().length > 0;
}

function summaryValue(component: CharacterSheetComponent, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (component.type === 'single_select') {
    const selected = Array.isArray(value) ? value : [value];
    return selected.map((selectedValue) => component.options.find((option) => characterSheetOptionValue(option) === selectedValue)?.label ?? String(selectedValue)).join(', ');
  }
  return String(value);
}

function validComponentValue(component: CharacterSheetComponent, value: unknown, values: Record<string, unknown>): boolean {
  if (!isFilled(value)) return !component.required;
  if (component.type === 'number') return Number.isFinite(Number(value));
  if (component.type !== 'single_select') return typeof value === 'string' && value.trim().length > 0;
  const allowed = new Set(getVisibleCharacterSheetOptions(component, values).map(characterSheetOptionValue));
  if (component.selection_mode === 'multiple') {
    return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && allowed.has(item)) && new Set(value).size === value.length;
  }
  return typeof value === 'string' && allowed.has(value);
}

export function CharacterForm({ definition, initialName = '', initialAttributes = {}, submitLabel = 'Criar personagem', error = null, saving = false, systemIsPublic = true, onSubmit, onCancel }: CharacterFormProps) {
  const [name, setName] = useState(initialName);
  const [systemPassword, setSystemPassword] = useState('');
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...initialAttributes }));
  const [activePageKey, setActivePageKey] = useState<CreationPage['key']>('character_name');
  const [pageError, setPageError] = useState('');
  const layoutMode = definition.layout_mode ?? 'step_by_step';
  const { components: visibleComponents, conditionValues } = resolveVisibleCharacterSheetComponents(definition, values);
  const visibleSteps = [...definition.steps].sort((a, b) => a.position - b.position)
    .map((step) => ({
      ...step,
      components: [...step.components].sort((a, b) => a.position - b.position)
        .filter((component) => visibleComponents.some((item) => item.component.key === component.key && item.step.key === step.key)),
    }))
    .filter((step) => step.components.length > 0);
  const pages: CreationPage[] = [
    { key: 'character_name', kind: 'name' },
    ...visibleComponents.map(({ step, component }) => ({ key: `component:${component.key}`, kind: 'component' as const, step, component })),
    { key: 'summary', kind: 'summary' },
  ];
  const foundIndex = pages.findIndex((page) => page.key === activePageKey);
  const activePageIndex = foundIndex >= 0 ? foundIndex : 0;
  const page = pages[activePageIndex]!;

  function attributesForSubmit(): Record<string, unknown> {
    const attributes: Record<string, unknown> = {};
    for (const { component } of visibleComponents) {
      const value = component.type === 'single_select' ? conditionValues[component.key] : values[component.key];
      if (!isFilled(value)) continue;
      if (component.type === 'number') {
        attributes[component.key] = Number(value);
      } else if (component.type === 'single_select' && component.selection_mode === 'multiple' && Array.isArray(value)) {
        const available = new Set(getVisibleCharacterSheetOptions(component, conditionValues).map(characterSheetOptionValue));
        attributes[component.key] = value.filter((selected): selected is string => typeof selected === 'string' && available.has(selected));
      } else if (component.type === 'single_select') {
        const available = new Set(getVisibleCharacterSheetOptions(component, conditionValues).map(characterSheetOptionValue));
        if (typeof value === 'string' && available.has(value)) attributes[component.key] = value;
      } else {
        attributes[component.key] = typeof value === 'string' ? value.trim() : value;
      }
    }
    return attributes;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (layoutMode === 'single_page') {
      if (!name.trim()) {
        setPageError('Informe o nome do personagem.');
        return;
      }
      const missing = visibleComponents.find(({ component }) => !validComponentValue(component, conditionValues[component.key], conditionValues));
      if (missing) {
        setPageError(`Preencha a informação obrigatória: ${missing.component.label}.`);
        return;
      }
      setPageError('');
      onSubmit(name.trim(), attributesForSubmit(), systemPassword || undefined);
      return;
    }

    if (page.kind !== 'summary') {
      const missing = page.kind === 'name'
        ? !name.trim()
        : !validComponentValue(page.component, conditionValues[page.component.key], conditionValues);
      if (missing) {
        setPageError(page.kind === 'name' ? 'Informe o nome do personagem.' : `Preencha a informação obrigatória: ${page.component.label}.`);
        return;
      }
      setPageError('');
      setActivePageKey(pages[activePageIndex + 1]!.key);
      return;
    }

    const missing = visibleComponents.find(({ component }) => !validComponentValue(component, conditionValues[component.key], conditionValues));
    if (missing) {
      const missingKey = `component:${missing.component.key}`;
      setActivePageKey(missingKey);
      setPageError(`Preencha a informação obrigatória: ${missing.component.label}.`);
      return;
    }
    setPageError('');
    onSubmit(name.trim(), attributesForSubmit(), systemPassword || undefined);
  }

  function updateValue(key: string, value: unknown) {
    setValues((current) => ({ ...current, [key]: value }));
    setPageError('');
  }

  const pageValues = { ...values };
  if (page.kind === 'component' && page.component.type === 'single_select') {
    if (Object.hasOwn(conditionValues, page.component.key)) pageValues[page.component.key] = conditionValues[page.component.key];
    else delete pageValues[page.component.key];
  }

  if (layoutMode === 'single_page') {
    return <form className="character-form character-wizard-form" onSubmit={submit}>
      <div className="character-step-progress" aria-live="polite">
        <span>Ficha completa</span>
        <strong>Dados do personagem</strong>
        <progress value={1} max={1} />
      </div>

      <label className="character-form-field character-wizard-question"><span>Como seu personagem se chama?</span><input required aria-required="true" maxLength={80} autoFocus value={name} onChange={(event) => { setName(event.target.value); setPageError(''); }} /></label>

      {visibleSteps.map((step) => <section key={step.key} className="character-wizard-question" aria-label={step.label}>
        <h2>{step.label}</h2>
        <CharacterSheetStepRenderer step={step} values={values} conditionValues={conditionValues} onValueChange={updateValue} mode="entry" />
      </section>)}

      {!systemIsPublic && <label className="character-form-field character-wizard-question"><span>Senha do sistema</span><input type="password" autoComplete="current-password" maxLength={72} value={systemPassword} onChange={(event) => setSystemPassword(event.target.value)} /><small>Necessária para novos participantes. Se você já participa deste sistema, deixe em branco.</small></label>}

      {pageError && <p role="alert" className="character-form-error">{pageError}</p>}
      {error && <p role="alert" className="character-form-error">{error}</p>}
      <div className="character-form-actions">
        <button type="button" className="character-secondary-button" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="character-primary-button" disabled={saving}>{saving ? 'Salvando...' : submitLabel}</button>
      </div>
    </form>;
  }

  return <form className="character-form character-wizard-form" onSubmit={submit}>
    <div className="character-step-progress" aria-live="polite">
      <span>Página {activePageIndex + 1} de {pages.length}</span>
      <strong>{page.kind === 'name' ? 'Nome do personagem' : page.kind === 'summary' ? 'Resumo do personagem' : page.component.label}</strong>
      <progress value={activePageIndex + 1} max={pages.length} />
    </div>

    {page.kind === 'name' && <label className="character-form-field character-wizard-question"><span>Como seu personagem se chama?</span><input required aria-required="true" maxLength={80} autoFocus value={name} onChange={(event) => { setName(event.target.value); setPageError(''); }} /></label>}
    {page.kind === 'component' && <section className="character-wizard-question" aria-label={page.component.label}>
      <h2>{page.component.label}{page.component.required ? ' *' : ''}</h2>
      <CharacterSheetStepRenderer step={{ ...page.step, components: [page.component] }} values={pageValues} conditionValues={conditionValues} onValueChange={updateValue} mode="entry" />
    </section>}
    {page.kind === 'summary' && <section className="character-wizard-summary" aria-labelledby="character-summary-title">
      <h2 id="character-summary-title">Confira as informações antes de criar</h2>
      <dl>
        <div><dt>Nome do personagem</dt><dd>{name || '—'}</dd></div>
        {visibleComponents.map(({ component }) => <div key={component.key}><dt>{component.label}</dt><dd>{summaryValue(component, component.type === 'single_select' ? conditionValues[component.key] : values[component.key])}</dd></div>)}
      </dl>
    </section>}

    {page.kind === 'summary' && !systemIsPublic && <label className="character-form-field character-wizard-question"><span>Senha do sistema</span><input type="password" autoComplete="current-password" maxLength={72} value={systemPassword} onChange={(event) => setSystemPassword(event.target.value)} /><small>Necessária para novos participantes. Se você já participa deste sistema, deixe em branco.</small></label>}

    {pageError && <p role="alert" className="character-form-error">{pageError}</p>}
    {error && <p role="alert" className="character-form-error">{error}</p>}
    <div className="character-form-actions">
      <button type="button" className="character-secondary-button" onClick={() => {
        if (activePageIndex === 0) onCancel();
        else {
          setPageError('');
          setActivePageKey(pages[activePageIndex - 1]!.key);
        }
      }}>{activePageIndex === 0 ? 'Cancelar' : 'Voltar'}</button>
      {page.kind === 'summary'
        ? <button type="submit" className="character-primary-button" disabled={saving}>{saving ? 'Salvando...' : submitLabel}</button>
        : <button type="submit" className="character-primary-button">{page.kind === 'component' && activePageIndex === pages.length - 2 ? 'Revisar ficha' : 'Próxima etapa'}</button>}
    </div>
  </form>;
}
