'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  getMyNotifications,
  getMySystemMemberships,
  markNotificationRead,
  publishSystemAnnouncement,
  type NotificationItem,
  type SystemMembership,
} from '../../api';
import './notifications.css';

type RoleChangePayload = {
  game_system_name: string;
  previous_role: 'user' | 'mod';
  new_role: 'user' | 'mod';
};

type AnnouncementPayload = { title: string; body: string };

function roleChangePayload(value: Record<string, unknown>): RoleChangePayload | null {
  if (typeof value.game_system_name !== 'string' || value.game_system_name.length === 0
    || (value.previous_role !== 'user' && value.previous_role !== 'mod')
    || (value.new_role !== 'user' && value.new_role !== 'mod')) return null;
  return {
    game_system_name: value.game_system_name,
    previous_role: value.previous_role,
    new_role: value.new_role,
  };
}

function announcementPayload(value: Record<string, unknown>): AnnouncementPayload | null {
  if (typeof value.title !== 'string' || value.title.length < 1 || value.title.length > 100
    || typeof value.body !== 'string' || value.body.length < 1 || value.body.length > 2000) return null;
  return { title: value.title, body: value.body };
}

function roleLabel(role: RoleChangePayload['previous_role']) {
  return role === 'mod' ? 'Mod' : 'User';
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('pt-BR');
}

function NotificationContent({ notification }: { notification: NotificationItem }) {
  if (notification.type === 'system_role_changed') {
    const payload = roleChangePayload(notification.payload);
    if (!payload) return <p>Notificação indisponível.</p>;
    return <p>Seu cargo em <strong>{payload.game_system_name}</strong> mudou de {roleLabel(payload.previous_role)} para {roleLabel(payload.new_role)}.</p>;
  }

  if (notification.type === 'system_announcement') {
    const payload = announcementPayload(notification.payload);
    if (!payload) return <p>Notificação indisponível.</p>;
    return <><h3>{payload.title}</h3><p>{payload.body}</p></>;
  }

  return <p>Você recebeu uma notificação.</p>;
}

function BellIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function NotificationCenter({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [memberships, setMemberships] = useState<SystemMembership[]>([]);
  const [selectedSystemId, setSelectedSystemId] = useState('');
  const [membershipLoading, setMembershipLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);
  const [publishError, setPublishError] = useState(false);

  const loadNotifications = useCallback(async (offset = 0, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await getMyNotifications(20, offset);
      setNotifications((current) => append ? [...current, ...result.notifications] : result.notifications);
      setUnreadCount(result.unread_count);
      setNextOffset(result.offset + result.notifications.length);
      setHasMore(result.notifications.length === result.limit);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar as notificações.');
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }, []);

  const loadMemberships = useCallback(async () => {
    setMembershipLoading(true);
    setMembershipError(null);
    try {
      const access = await getMySystemMemberships();
      const manageable = access.memberships.filter((membership) => membership.role === 'owner' || membership.role === 'mod');
      setMemberships(manageable);
      if (manageable.length === 0) setComposerOpen(false);
      setSelectedSystemId((selected) => manageable.some((membership) => membership.game_system_id === selected)
        ? selected
        : manageable[0]?.game_system_id || '');
    } catch (loadError) {
      setMembershipError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar seus sistemas.');
    } finally {
      setMembershipLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
    void loadMemberships();
  }, [loadMemberships, loadNotifications]);

  useEffect(() => {
    if (!open) return;
    void loadNotifications();
    void loadMemberships();
  }, [open, loadMemberships, loadNotifications]);

  async function handleMarkRead(notification: NotificationItem) {
    if (notification.read_at || updatingId) return;
    setUpdatingId(notification.id);
    setError(null);
    try {
      await markNotificationRead(notification.id);
      setNotifications((current) => current.map((item) => item.id === notification.id
        ? { ...item, read_at: new Date().toISOString() }
        : item));
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Não foi possível marcar a notificação como lida.');
    } finally {
      setUpdatingId(null);
    }
  }

  async function handlePublish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSystemId) return;
    setPublishing(true);
    setPublishMessage(null);
    try {
      await publishSystemAnnouncement(selectedSystemId, { title, body });
      setTitle('');
      setBody('');
      setPublishMessage('Comunicado enviado aos membros do sistema.');
      setPublishError(false);
      await loadNotifications();
    } catch (publishErrorValue) {
      setPublishMessage(publishErrorValue instanceof Error ? publishErrorValue.message : 'Não foi possível publicar o comunicado.');
      setPublishError(true);
    } finally {
      setPublishing(false);
    }
  }

  const manageableMemberships = memberships.filter((membership) => membership.role === 'owner' || membership.role === 'mod');

  return <div className="notification-center">
    <button
      className={`notification-toggle${compact ? ' compact' : ''}`}
      type="button"
      aria-label={compact ? 'Notificações' : 'Abrir notificações'}
      aria-expanded={open}
      aria-controls="notification-panel"
      onClick={() => setOpen((value) => !value)}
    >
      <span className="notification-toggle-icon" aria-hidden="true"><BellIcon size={compact ? 18 : 16} /></span>
      {!compact && <span className="notification-toggle-label">Notificações</span>}
      {unreadCount > 0 && <span className="notification-count" aria-label={`${unreadCount} não lidas`}>{unreadCount}</span>}
    </button>
    {open && <section className="notification-panel" id="notification-panel" aria-label="Central de notificações">
      <div className="notification-panel-heading">
        <div><span className="dashboard-overline">SUA CONTA</span><h2>Notificações</h2></div>
        <button className="notification-close" type="button" onClick={() => setOpen(false)} aria-label="Fechar notificações">×</button>
      </div>

      {manageableMemberships.length > 0 && <button
        className="notification-compose-toggle"
        type="button"
        aria-expanded={composerOpen}
        onClick={() => { setComposerOpen((value) => !value); setPublishMessage(null); }}
      >{composerOpen ? 'Fechar comunicados' : 'Publicar comunicado'}</button>}

      {membershipLoading && <p className="notification-muted" role="status">Carregando seus sistemas…</p>}
      {membershipError && <div className="notification-error-block" role="alert">
        <p>{membershipError}</p><button type="button" onClick={() => void loadMemberships()}>Tentar carregar sistemas novamente</button>
      </div>}

      {composerOpen && <form className="announcement-form" onSubmit={(event) => void handlePublish(event)}>
        <label>
          Sistema
          <select value={selectedSystemId} onChange={(event) => setSelectedSystemId(event.target.value)} required>
            {manageableMemberships.map((membership) => <option key={membership.game_system_id} value={membership.game_system_id}>{membership.game_system_name}</option>)}
          </select>
        </label>
        <label>
          Título
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} required />
        </label>
        <label>
          Comunicado
          <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} rows={4} required />
        </label>
        {publishMessage && <p className={publishError ? 'notification-error' : 'notification-success'} role="status">{publishMessage}</p>}
        <button className="notification-submit" type="submit" disabled={publishing || !selectedSystemId}>
          {publishing ? 'Enviando…' : 'Enviar para os membros'}
        </button>
      </form>}

      {error && <div className="notification-error-block" role="alert">
        <p>{error}</p><button type="button" onClick={() => void loadNotifications()}>Tentar novamente</button>
      </div>}
      {loading && <p className="notification-muted" role="status">Carregando notificações…</p>}
      {!loading && !error && notifications.length === 0 && <p className="notification-muted">Você ainda não tem notificações.</p>}
      {!loading && notifications.length > 0 && <ul className="notification-list">
        {notifications.map((notification) => <li key={notification.id} className={notification.read_at ? '' : 'unread'}>
          <div className="notification-item-content">
            <NotificationContent notification={notification} />
            <time dateTime={notification.created_at}>{formatDate(notification.created_at)}</time>
          </div>
          {notification.read_at
            ? <span className="notification-read-label">Lida</span>
            : <button
              className="notification-read-button"
              type="button"
              disabled={updatingId === notification.id}
              onClick={() => void handleMarkRead(notification)}
            >{updatingId === notification.id ? 'Salvando…' : 'Marcar como lida'}</button>}
        </li>)}
      </ul>}
      {!loading && hasMore && <button
        className="notification-load-more"
        type="button"
        disabled={loadingMore}
        onClick={() => void loadNotifications(nextOffset, true)}
      >{loadingMore ? 'Carregando…' : 'Carregar mais'}</button>}
    </section>}
  </div>;
}
