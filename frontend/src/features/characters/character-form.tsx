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
  function nextStep(){const step=steps[activeStep];const missing=step?.components.find(c=>c.required&&!(values[c.key]??'').trim());if(missing){setStepError(`Preencha o campo obrigatório: ${missing.label}.`);return}setStepError('');setActiveStep(i=>Math.min(i+1,steps.length-1))}

  return (
    <form className="character-form" onSubmit={submit}>
      <label className="character-form-field"><span>Nome do personagem</span><input required aria-required="true" maxLength={80} autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label>
      {steps.length>1&&<p aria-live="polite">Etapa {activeStep+1} de {steps.length}: {steps[activeStep]?.label}</p>}
      {steps[activeStep]&&<CharacterSheetStepRenderer step={steps[activeStep]!} values={values} onValueChange={(key,value)=>setValues(current=>({...current,[key]:String(value)}))} mode="entry"/>}
      {stepError&&<p role="alert" className="character-form-error">{stepError}</p>}
      {error && <p role="alert" className="character-form-error">{error}</p>}
      <div className="character-form-actions"><button type="button" className="character-secondary-button" onClick={activeStep?()=>setActiveStep(i=>i-1):onCancel}>{activeStep?'Voltar':'Cancelar'}</button>{activeStep<steps.length-1?<button type="button" className="character-primary-button" onClick={nextStep}>Próxima etapa</button>:<button type="submit" className="character-primary-button" disabled={saving}>{saving ? 'Salvando...' : submitLabel}</button>}</div>
    </form>
  );
}
