'use client';

import type { CharacterSheetField, CharacterSheetFieldType } from '../../api';
import { addSheetField, moveSheetField, removeSheetField } from './sheet-model';
import './system-creation.css';

interface CharacterSheetBuilderProps {
  fields: CharacterSheetField[];
  onChange: (fields: CharacterSheetField[]) => void;
}

const fieldTypes: { value: CharacterSheetFieldType; label: string }[] = [
  { value: 'short_text', label: 'Texto curto' },
  { value: 'long_text', label: 'Texto longo' },
  { value: 'number', label: 'Número' },
  { value: 'single_select', label: 'Seleção única' },
];

export function CharacterSheetBuilder({ fields, onChange }: CharacterSheetBuilderProps) {
  function updateField(fieldKey: string, patch: Partial<CharacterSheetField>) {
    onChange(fields.map((field) => field.key === fieldKey ? { ...field, ...patch } : field));
  }

  function changeType(field: CharacterSheetField, type: CharacterSheetFieldType) {
    if (type === 'single_select') {
      updateField(field.key, { type, options: ['Opção 1'] });
      return;
    }
    const { options: _options, ...base } = field;
    onChange(fields.map((current) => current.key === field.key ? { ...base, type } : current));
  }

  return (
    <section className="sheet-builder" aria-labelledby="sheet-builder-title">
      <div className="sheet-builder-heading">
        <div>
          <span className="sheet-builder-eyebrow">FICHA DO PERSONAGEM</span>
          <h2 id="sheet-builder-title">Defina os campos da ficha</h2>
          <p>O nome do personagem já vem incluído. Adicione os atributos usados neste sistema.</p>
        </div>
      </div>

      <div className="sheet-built-in-field">
        <span className="sheet-field-number">01</span>
        <div>
          <strong>Nome do personagem</strong>
          <span>Campo obrigatório incluído automaticamente</span>
        </div>
        <span className="sheet-required-badge">Obrigatório</span>
      </div>

      <div className="sheet-custom-fields">
        {fields.map((field, index) => {
          const optionsId = `sheet-${field.key}-options`;
          return (
            <fieldset className="sheet-field-card" key={field.key}>
              <legend className="sr-only">Campo configurável {index + 1}</legend>
              <div className="sheet-field-topline">
                <span className="sheet-field-number">{String(index + 2).padStart(2, '0')}</span>
                <label className="sheet-field-label-control">
                  <span>Nome do campo</span>
                  <input
                    value={field.label}
                    maxLength={80}
                    onChange={(event) => updateField(field.key, { label: event.target.value })}
                    aria-label={`Nome do campo ${field.label || index + 1}`}
                  />
                </label>
                <label className="sheet-field-type-control">
                  <span>Tipo</span>
                  <select
                    value={field.type}
                    onChange={(event) => changeType(field, event.target.value as CharacterSheetFieldType)}
                    aria-label={`Tipo do campo ${field.label || index + 1}`}
                  >
                    {fieldTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                </label>
              </div>

              {field.type === 'single_select' && <label className="sheet-field-options" htmlFor={optionsId}>
                <span>Opções, uma por linha</span>
                <textarea
                  id={optionsId}
                  value={(field.options ?? []).join('\n')}
                  rows={3}
                  onChange={(event) => updateField(field.key, {
                    options: event.target.value.split('\n').map((option) => option.trim()).filter(Boolean),
                  })}
                />
              </label>}

              <div className="sheet-field-settings">
                <label className="sheet-checkbox">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(event) => updateField(field.key, { required: event.target.checked })}
                  />
                  <span>Obrigatório</span>
                </label>
                <label className="sheet-checkbox">
                  <input
                    type="checkbox"
                    checked={field.show_on_card}
                    onChange={(event) => updateField(field.key, { show_on_card: event.target.checked })}
                  />
                  <span>Exibir na galeria</span>
                </label>
                <div className="sheet-field-actions">
                  <button
                    type="button"
                    aria-label={`Mover campo ${field.label} para cima`}
                    disabled={index === 0}
                    onClick={() => onChange(moveSheetField(fields, field.key, 'up'))}
                  >↑</button>
                  <button
                    type="button"
                    aria-label={`Mover campo ${field.label} para baixo`}
                    disabled={index === fields.length - 1}
                    onClick={() => onChange(moveSheetField(fields, field.key, 'down'))}
                  >↓</button>
                  <button
                    type="button"
                    className="sheet-remove-button"
                    aria-label={`Remover campo ${field.label}`}
                    onClick={() => onChange(removeSheetField(fields, field.key))}
                  >
                    Remover
                  </button>
                </div>
              </div>
            </fieldset>
          );
        })}
      </div>

      <button type="button" className="sheet-add-button" onClick={() => onChange(addSheetField(fields))}>
        <span aria-hidden="true">+</span> Adicionar campo
      </button>
    </section>
  );
}
