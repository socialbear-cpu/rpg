'use client';

import type { FormEventHandler } from 'react';
import type { DailyLoginSystemView, ExperienceSettingsInput } from '../../api';
import { experienceSettingsAreValid } from './experience-model';

type Props = {
  systems: DailyLoginSystemView[];
  selectedSystemId: string;
  settings: (ExperienceSettingsInput & { game_system_id: string }) | null;
  loading: boolean;
  saving: boolean;
  message: string | null;
  messageIsError: boolean;
  onSystemChange: (systemId: string) => void;
  onXpPerLevelChange: (amount: number) => void;
  onSourceChange: (index: number, field: 'name' | 'award_amount' | 'is_enabled', value: string | number | boolean) => void;
  onAddCustomSource: () => void;
  onRemoveCustomSource: (index: number) => void;
  onSave: FormEventHandler<HTMLFormElement>;
};

const sourceLabels = {
  daily_login: 'Login diário',
  mission: 'Missão',
  fight: 'Luta',
  custom: 'Personalizada',
} as const;

export function ExperienceAdminCard({
  systems,
  selectedSystemId,
  settings,
  loading,
  saving,
  message,
  messageIsError,
  onSystemChange,
  onXpPerLevelChange,
  onSourceChange,
  onAddCustomSource,
  onRemoveCustomSource,
  onSave,
}: Props) {
  const manageableSystems = systems.filter((entry) => entry.can_manage);
  if (manageableSystems.length === 0) return null;

  const selected = manageableSystems.find((entry) => entry.system.id === selectedSystemId) ?? manageableSystems[0]!;
  const current = settings?.game_system_id === selected.system.id ? settings : null;
  const valid = experienceSettingsAreValid(current
    ? { xp_per_level: current.xp_per_level, sources: current.sources }
    : null);

  return <article className="card experience-admin-card">
    <div className="section-heading"><div><p className="eyebrow">OWNER</p><h2>Configurar experiência e XP</h2></div><span className="step">XP</span></div>
    <p className="card-copy">Defina quanto XP leva a subir de nível e configure as fontes deste sistema.</p>
    {message && <p className={`notice${messageIsError ? ' error' : ''}`} role="status" aria-live="polite">{message}</p>}
    {manageableSystems.length > 1 && <label className="daily-field" htmlFor="experience-owner-system">Sistema de RPG
      <select id="experience-owner-system" value={selected.system.id} onChange={(event) => onSystemChange(event.target.value)}>
        {manageableSystems.map(({ system }) => <option key={system.id} value={system.id}>{system.name}</option>)}
      </select>
    </label>}
    {loading && <p className="card-copy" role="status">Carregando regras de XP…</p>}
    {!loading && !current && <p className="daily-state" role="status">Não foi possível carregar as regras deste sistema.</p>}
    {!loading && current && <form className="experience-admin-form" onSubmit={onSave}>
      <label className="daily-field" htmlFor="experience-xp-per-level">XP necessário por nível
        <input
          id="experience-xp-per-level"
          type="number"
          min={1}
          max={1_000_000}
          step={1}
          required
          value={current.xp_per_level}
          onChange={(event) => onXpPerLevelChange(event.target.value === '' ? 0 : Number(event.target.value))}
        />
      </label>
      <div className="experience-source-list">
        {current.sources.map((source, index) => (
          <div className="experience-source-row" key={source.id ?? `${source.source_type}-${index}`}>
            <div className="experience-source-title">{sourceLabels[source.source_type]}</div>
            <label htmlFor={`experience-source-name-${index}`}>Nome da fonte
              <input
                id={`experience-source-name-${index}`}
                type="text"
                maxLength={80}
                required
                value={source.name}
                onChange={(event) => onSourceChange(index, 'name', event.target.value)}
                readOnly={source.source_type !== 'custom'}
              />
            </label>
            <label htmlFor={`experience-source-amount-${index}`}>XP por evento
              <input
                id={`experience-source-amount-${index}`}
                type="number"
                min={0}
                max={1_000_000}
                step={1}
                required
                value={source.award_amount}
                onChange={(event) => onSourceChange(index, 'award_amount', event.target.value === '' ? 0 : Number(event.target.value))}
              />
            </label>
            <label className="experience-source-toggle" htmlFor={`experience-source-enabled-${index}`}>
              <input
                id={`experience-source-enabled-${index}`}
                type="checkbox"
                checked={source.is_enabled}
                onChange={(event) => onSourceChange(index, 'is_enabled', event.target.checked)}
              />
              Ativa
            </label>
            {source.source_type === 'custom' && <button
              className="text-button experience-remove-source"
              type="button"
              onClick={() => onRemoveCustomSource(index)}
            >Remover</button>}
          </div>
        ))}
      </div>
      <button className="button secondary experience-add-source" type="button" onClick={onAddCustomSource}>
        Adicionar fonte personalizada
      </button>
      {!valid && <p className="field-hint" role="status">Confira o valor por nível, os nomes das fontes e os valores das fontes ativas.</p>}
      <div className="actions"><button className="button primary" type="submit" disabled={saving || !valid}>
        {saving ? 'Salvando…' : 'Salvar configuração de XP'}
      </button></div>
    </form>}
  </article>;
}
