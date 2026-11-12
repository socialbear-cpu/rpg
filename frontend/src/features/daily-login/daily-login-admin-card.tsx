'use client';

import type { FormEventHandler } from 'react';
import './daily-login-admin.css';
import type { DailyLoginOwnerCalendar, DailyLoginSystemView } from '../../api';

const weekdays = [
  'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira',
  'Sexta-feira', 'Sábado', 'Domingo',
];

type Props = {
  systems: DailyLoginSystemView[];
  selectedSystemId: string;
  calendar: DailyLoginOwnerCalendar | null;
  loading: boolean;
  saving: boolean;
  message: string | null;
  messageIsError: boolean;
  onSystemChange: (systemId: string) => void;
  onRewardChange: (weekday: number, field: 'item_id' | 'quantity' | 'currency_amount', value: string | number) => void;
  onActiveChange: (isActive: boolean) => void;
  onSave: FormEventHandler<HTMLFormElement>;
};

export function DailyLoginAdminCard({
  systems,
  selectedSystemId,
  calendar,
  loading,
  saving,
  message,
  messageIsError,
  onSystemChange,
  onRewardChange,
  onActiveChange,
  onSave,
}: Props) {
  const manageableSystems = systems.filter((entry) => entry.can_manage);
  if (manageableSystems.length === 0) return null;

  const selected = manageableSystems.find((entry) => entry.system.id === selectedSystemId) ?? manageableSystems[0]!;
  const rewards = calendar?.system.id === selected.system.id ? calendar.rewards : [];
  const rewardByDay = new Map(rewards.map((reward) => [reward.weekday, reward]));
  const complete = weekdays.every((_, index) => {
    const reward = rewardByDay.get(index + 1);
    return reward !== undefined
      && calendar?.items.some((item) => item.id === reward.item_id)
      && Number.isInteger(reward.quantity)
      && reward.quantity >= 1
      && reward.quantity <= 1_000_000
      && Number.isFinite(reward.currency_amount ?? 0)
      && (reward.currency_amount ?? 0) >= 0
      && (reward.currency_amount ?? 0) <= 9999999999.99;
  });

  return <article className="card daily-login-admin-card">
    <div className="section-heading"><div><p className="eyebrow">{manageableSystems.some((entry) => !entry.is_owner) ? 'OWNER / ADMIN' : 'OWNER'}</p><h2>Gerenciar recompensas diárias</h2></div><span className="step">02</span></div>
    <p className="card-copy">Escolha um item do catálogo e a quantidade para cada dia da semana deste sistema.</p>
    {message && <p className={`notice${messageIsError ? ' error' : ''}`} role="status" aria-live="polite">{message}</p>}
    {manageableSystems.length > 1 && <label className="daily-field" htmlFor="daily-login-owner-system">Sistema de RPG
      <select id="daily-login-owner-system" value={selected.system.id} onChange={(event) => onSystemChange(event.target.value)}>
        {manageableSystems.map(({ system }) => <option key={system.id} value={system.id}>{system.name}</option>)}
      </select>
    </label>}
    {loading && <p className="card-copy" role="status">Carregando calendário…</p>}
    {!loading && calendar?.system.id === selected.system.id && <>
      {calendar.items.length === 0 && <p className="daily-state" role="status">Cadastre itens neste sistema antes de ativar as recompensas.</p>}
      <form className="daily-admin-form" onSubmit={onSave}>
        <div className="daily-week-grid">
          {weekdays.map((day, index) => {
            const weekday = index + 1;
            const reward = rewardByDay.get(weekday);
            const id = `daily-login-item-${weekday}`;
            return <div className="daily-week-row" key={weekday}>
              <label htmlFor={id}>{day}</label>
              <select id={id} value={reward?.item_id ?? ''} onChange={(event) => onRewardChange(weekday, 'item_id', event.target.value)} required>
                <option value="">Selecione um item</option>
                {calendar.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <label className="daily-quantity-label" htmlFor={`daily-login-quantity-${weekday}`}>Quantidade
                <input
                  id={`daily-login-quantity-${weekday}`}
                  type="number"
                  min={1}
                  max={1_000_000}
                  step={1}
                  required
                  value={reward?.quantity ?? 1}
                  onChange={(event) => onRewardChange(weekday, 'quantity', event.target.value === '' ? 0 : Number(event.target.value))}
                />
              </label>
              <label className="daily-quantity-label" htmlFor={`daily-login-currency-${weekday}`}>Moedas (opcional)
                <input id={`daily-login-currency-${weekday}`} type="number" min={0} max={9999999999.99} step="0.01" value={reward?.currency_amount ?? 0} onChange={(event) => onRewardChange(weekday, 'currency_amount', Number(event.target.value))} />
              </label>
            </div>;
          })}
        </div>
        <label className="daily-active-toggle"><input type="checkbox" checked={calendar.is_active} onChange={(event) => onActiveChange(event.target.checked)} /> Ativar calendário de recompensas</label>
        <div className="actions"><button className="button primary" type="submit" disabled={saving || !complete}>
          {saving ? 'Salvando…' : 'Salvar calendário'}
        </button></div>
      </form>
    </>}
  </article>;
}
