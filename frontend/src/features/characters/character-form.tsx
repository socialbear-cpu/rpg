'use client';

import { useState, type FormEvent } from 'react';
import type { CharacterSheetDefinition } from '../../api';
import { CharacterSheetStepRenderer } from '../character-sheet/character-sheet-step-renderer';
import './characters.css';

interface CharacterFormProps {
  definition: CharacterSheetDefinition;
  initialName?: string;
  initialAttributes?: Record<string, unknown>;
  submitLabel?: string;
  error?: string | null;
  saving?: boolean;
  onSubmit: (characterName: string, attributes: Record<string, unknown>) => void;
  onCancel: () => void;
}

export function CharacterForm({ definition, initialName = '', initialAttributes = {}, submitLabel = 'Criar personagem', error = null, saving = false, onSubmit, onCancel }: CharacterFormProps) {
  const [name, setName] = useState(initialName);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(initialAttributes).map(([key, value]) => [key, String(value)])));
  const steps = [...definition.steps].sort((a,b)=>a.position-b.position);
  const [activeStep,setActiveStep]=useState(0);
  const [stepError,setStepError]=useState('');
  const step = steps[activeStep];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    for (let index = 0; index < steps.length; index++) {
      const missing = steps[index]!.components.find((component) => component.required && !(values[component.key] ?? '').trim());
      if (missing) { setActiveStep(index); setStepError(`Preencha o campo obrigatório: ${missing.label}.`); return; }
    }
    setStepError('');
    const attributes: Record<string, unknown> = {};
    for (const step of steps) for (const component of step.components) { const value=values[component.key]??''; if(!value.trim())continue; attributes[component.key]=component.type==='number'?Number(value):value.trim(); }
    onSubmit(name.trim(), attributes);
  }
  function isStepComplete(currentStep: typeof step, nextValues: Record<string, string>) {
    const required = currentStep?.components.filter((component) => component.required) ?? [];
    return required.length > 0 && required.every((component) => Boolean((nextValues[component.key] ?? '').trim()));
  }

  function maybeAdvance(nextValues: Record<string, string>) {
    if (isStepComplete(step, nextValues) && activeStep < steps.length - 1) {
      setStepError('');
      setActiveStep((current) => Math.min(current + 1, steps.length - 1));
    }
  }

  function updateValue(key: string, value: unknown) {
    const nextValues = { ...values, [key]: String(value) };
    setValues(nextValues);
    const component = step?.components.find((item) => item.key === key);
    if (component?.type === 'single_select') maybeAdvance(nextValues);
  }

  function nextStep() {
    const missing = step?.components.find((component) => component.required && !(values[component.key] ?? '').trim());
    if (missing) { setStepError(`Preencha o campo obrigatório: ${missing.label}.`); return; }
    setStepError('');
    setActiveStep((index) => Math.min(index + 1, steps.length - 1));
  }

  return (
    <form className="character-form" onSubmit={submit}>
      {activeStep === 0 && <label className="character-form-field"><span>Nome do personagem</span><input required aria-required="true" maxLength={80} autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label>}
      {steps.length > 1 && <div className="character-step-progress" aria-live="polite"><span>Etapa {activeStep + 1} de {steps.length}</span><strong>{step?.label}</strong><small>Ao preencher os obrigatórios, a ficha avança automaticamente. Você também pode usar Próxima etapa.</small><progress value={activeStep + 1} max={steps.length} /></div>}
      {step && <CharacterSheetStepRenderer step={step} values={values} onValueChange={updateValue} onFieldBlur={() => maybeAdvance(values)} mode="entry" />}
      {stepError&&<p role="alert" className="character-form-error">{stepError}</p>}
      {error && <p role="alert" className="character-form-error">{error}</p>}
      <div className="character-form-actions"><button type="button" className="character-secondary-button" onClick={activeStep ? () => setActiveStep((index) => index - 1) : onCancel}>{activeStep ? 'Voltar' : 'Cancelar'}</button>{activeStep < steps.length - 1 ? <button type="button" className="character-primary-button" onClick={nextStep}>Próxima etapa</button> : <button type="submit" className="character-primary-button" disabled={saving}>{saving ? 'Salvando...' : submitLabel}</button>}</div>
    </form>
  );
}
