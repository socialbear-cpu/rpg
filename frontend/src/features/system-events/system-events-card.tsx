'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { createSystemEvent, deleteSystemEvent, getSystemEvents, startSystemEvent, updateSystemEvent, type SystemEvent, type SystemEventInput } from '../../api';
import './system-events-card.css';

interface SystemEventsListProps {
  events: SystemEvent[];
  canManage: boolean;
  onEdit: (event: SystemEvent) => void;
  onDelete: (event: SystemEvent) => void;
  onStart?: (event: SystemEvent) => void;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function SystemEventsList({ events, canManage, onEdit, onDelete, onStart }: SystemEventsListProps) {
  if (events.length === 0) return <p className="system-events-empty">Nenhum evento foi marcado para este sistema.</p>;
  return <ol className="system-events-list">{events.map((event) => <li key={event.id}>
    <article className="system-event">
      <div className="system-event-copy"><h3>{event.title}</h3>{event.description && <p>{event.description}</p>}
        {event.started_at && <p className="system-event-started" role="status">Evento iniciado</p>}
        <dl><div><dt>Início</dt><dd>{formatDate(event.starts_at)}</dd></div><div><dt>Término</dt><dd>{formatDate(event.ends_at)}</dd></div></dl>
      </div>
      {canManage && <div className="system-event-actions">{!event.started_at && onStart && <button type="button" aria-label={`Iniciar evento ${event.title}`} onClick={() => onStart(event)}>Iniciar evento</button>}<button type="button" aria-label={`Editar evento ${event.title}`} onClick={() => onEdit(event)}>Editar</button><button type="button" aria-label={`Excluir evento ${event.title}`} onClick={() => onDelete(event)}>Excluir</button></div>}
    </article>
  </li>)}</ol>;
}

function localDateTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function SystemEventsCard({ systemId, canManage = false }: { systemId: string; canManage?: boolean }) {
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [startingEventId, setStartingEventId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SystemEvent | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  async function refresh() {
    setLoading(true);
    setError(null);
    try { setEvents((await getSystemEvents(systemId)).events); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os eventos.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, [systemId]);

  function resetForm() {
    setEditing(null); setTitle(''); setDescription(''); setStartsAt(''); setEndsAt('');
  }

  function startEditing(event: SystemEvent) {
    setEditing(event); setTitle(event.title); setDescription(event.description ?? '');
    setStartsAt(localDateTime(event.starts_at)); setEndsAt(localDateTime(event.ends_at));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(null);
    const input: SystemEventInput = { title: title.trim(), description: description.trim() || null, starts_at: new Date(startsAt).toISOString(), ends_at: new Date(endsAt).toISOString() };
    try {
      if (editing) await updateSystemEvent(systemId, editing.id, input);
      else await createSystemEvent(systemId, input);
      resetForm(); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o evento.'); }
    finally { setBusy(false); }
  }

  async function remove(event: SystemEvent) {
    setBusy(true); setError(null);
    try { await deleteSystemEvent(systemId, event.id); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível excluir o evento.'); }
    finally { setBusy(false); }
  }

  async function start(event: SystemEvent) {
    setStartingEventId(event.id); setError(null);
    try { await startSystemEvent(systemId, event.id); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível iniciar o evento.'); }
    finally { setStartingEventId(null); }
  }

  return <section className="system-events-card" aria-labelledby="system-events-heading">
    <header><div><h2 id="system-events-heading">Eventos</h2></div></header>
    {canManage && <form className="system-events-form" onSubmit={(event) => void save(event)}>
      <h3>{editing ? 'Editar evento' : 'Novo evento'}</h3>
      <label>Título<input required minLength={1} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label>Descrição (opcional)<textarea maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <div className="system-events-dates"><label>Início<input required type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label><label>Término<input required type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label></div>
      <div className="system-events-form-actions"><button type="submit" disabled={busy || !startsAt || !endsAt}>{busy ? 'Salvando…' : editing ? 'Salvar evento' : 'Criar evento'}</button>{editing && <button type="button" disabled={busy} onClick={resetForm}>Cancelar edição</button>}</div>
    </form>}
    {error && <p role="alert" className="system-events-error">{error}</p>}
    {loading ? <p role="status">Carregando eventos…</p> : <SystemEventsList events={events} canManage={canManage} onEdit={startEditing} onDelete={(event) => void remove(event)} onStart={(event) => { if (startingEventId !== event.id) void start(event); }} />}
  </section>;
}
