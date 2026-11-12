'use client';

import { useState, type FormEvent } from 'react';
import type { CharacterSheetField } from '../../api';
import './characters.css';

interface CharacterFormProps {
  fields: CharacterSheetField[];
  initialName?: string;
  initialAttributes?: Record<string, unknown>;
  submitLabel?: string;
  error?: string | null;
  saving?: boolean;
  onSubmit: (characterName: string, attributes: Record<string, unknown>) => void;
  onCancel: () => void;
}

export function CharacterForm({ fields, initialName = '', initialAttributes = {}, submitLabel = 'Criar personagem', error = null, saving = false, onSubmit, onCancel }: CharacterFormProps) {
  const [name, setName] = useState(initialName);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(initialAttributes).map(([key, value]) => [key, String(value)])));
  const orderedFields = [...fields].sort((a, b) => a.position - b.position);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const attributes: Record<string, unknown> = {};
    for (const field of orderedFields) {
      const value = values[field.key] ?? '';
      if (!value.trim()) continue;
      attributes[field.key] = field.type === 'number' ? Number(value) : value.trim();
    }
    onSubmit(name.trim(), attributes);
  }

  return (
    <form className="character-form" onSubmit={submit}>
      <label className="character-form-field"><span>Nome do personagem</span><input required aria-required="true" maxLength={80} autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label>
      {orderedFields.map((field) => {
        const id = `character-${field.key}`;
        const common = { id, required: field.required, 'aria-required': field.required, value: values[field.key] ?? '', onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setValues((current) => ({ ...current, [field.key]: event.target.value })) };
        return <label className="character-form-field" key={field.key} htmlFor={id}><span>{field.label}{field.required && <span aria-hidden="true"> *</span>}</span>
          {field.type === 'long_text' ? <textarea {...common} rows={4} /> : field.type === 'single_select' ? <select {...common}><option value="">Selecione uma opção</option>{(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}</select> : <input {...common} type={field.type === 'number' ? 'number' : 'text'} />}
        </label>;
      })}
      {error && <p role="alert" className="character-form-error">{error}</p>}
      <div className="character-form-actions"><button type="button" className="character-secondary-button" onClick={onCancel}>Cancelar</button><button type="submit" className="character-primary-button" disabled={saving}>{saving ? 'Salvando...' : submitLabel}</button></div>
    </form>
  );
}
