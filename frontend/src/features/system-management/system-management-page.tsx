'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getGameSystems,
  getMyDailyLoginSystems,
  getMySystemMemberships,
  getOwnerDailyLoginCalendar,
  getOwnerExperienceSettings,
  saveOwnerDailyLoginCalendar,
  saveOwnerExperienceSettings,
  setSystemModerator,
  updateGameSystemLifecycle,
  type DailyLoginOwnerCalendar,
  type DailyLoginSystemView,
  type ExperienceSettingsInput,
  type GameSystem,
  type SystemMemberships,
} from '../../api';
import { hasSession, sendDeletionEmailLink } from '../../supabase-auth';
import { AppHeader } from '../shell/app-header';
import { DailyLoginAdminCard } from '../daily-login/daily-login-admin-card';
import { SystemStoreAdmin } from '../store/store-admin-card';
import { ExperienceAdminCard } from '../experience/experience-admin-card';
import { SystemEventsCard } from '../system-events/system-events-card';
import { addCustomExperienceSource } from '../experience/experience-model';
import { SystemMembershipCard } from '../system-membership/system-membership-card';
import { SystemSheetEditor } from '../system-creation/system-sheet-editor';
import { SystemDetailsEditor } from './system-details-editor';
import '../system-creation/system-creation.css';
import './system-management-page.css';

type PageState = 'loading' | 'ready' | 'forbidden' | 'error';
type ManagementCategory = 'overview' | 'people' | 'game' | 'store' | 'sheet' | 'events' | 'community' | 'settings';

const managementSections: { id: ManagementCategory; label: string; icon: string }[] = [
  { id: 'overview', label: 'Visão geral', icon: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z' },
  { id: 'people', label: 'Pessoas', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M17 4a4 4 0 0 1 0 7 M22 21v-2a4 4 0 0 0-3-3.87' },
  { id: 'game', label: 'Jogo', icon: 'M12 3 3 8v9l9 5 9-5V8z M3 8l9 5 9-5 M12 13v9 M7.5 5.5l9 5' },
  { id: 'store', label: 'Loja', icon: 'M3 3h2l3 13h11l3-9H6 M10 21h.01 M18 21h.01' },
  { id: 'sheet', label: 'Ficha', icon: 'M14 2H6v20h12V6z M14 2v5h5 M9 12h6 M9 16h6' },
  { id: 'events', label: 'Eventos', icon: 'M3 5h18v16H3z M16 3v4 M8 3v4 M3 11h18 M8 15h2 M14 15h2' },
  { id: 'community', label: 'Comunidade', icon: 'M21 11.5a8.5 8.5 0 0 1-8.5 8.5H3l2-5a8.5 8.5 0 1 1 16-3.5 M8 11h8 M8 15h5' },
  { id: 'settings', label: 'Configurações', icon: 'M4 7h16 M4 17h16 M8 4v6 M16 14v6' },
];

export function SystemManagementPage() {
  const { systemId } = useParams<{ systemId: string }>();
  const router = useRouter();
  const [pageState, setPageState] = useState<PageState>('loading');
  const [activeCategory, setActiveCategory] = useState<ManagementCategory>('overview');
  const [pageError, setPageError] = useState('');
  const [systemView, setSystemView] = useState<DailyLoginSystemView | null>(null);
  const [systemIsPublic, setSystemIsPublic] = useState(true);
  const [gameSystem, setGameSystem] = useState<GameSystem | null>(null);
  const [manageableSystems, setManageableSystems] = useState<DailyLoginSystemView[]>([]);
  const [access, setAccess] = useState<SystemMemberships | null>(null);
  const [calendar, setCalendar] = useState<DailyLoginOwnerCalendar | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarSaving, setCalendarSaving] = useState(false);
  const [calendarMessage, setCalendarMessage] = useState<string | null>(null);
  const [calendarMessageIsError, setCalendarMessageIsError] = useState(false);
  const [experience, setExperience] = useState<(ExperienceSettingsInput & { game_system_id: string }) | null>(null);
  const [experienceLoading, setExperienceLoading] = useState(true);
  const [experienceSaving, setExperienceSaving] = useState(false);
  const [experienceMessage, setExperienceMessage] = useState<string | null>(null);
  const [experienceMessageIsError, setExperienceMessageIsError] = useState(false);
  const [membershipBusy, setMembershipBusy] = useState(false);
  const [membershipMessage, setMembershipMessage] = useState<string | null>(null);
  const [membershipMessageIsError, setMembershipMessageIsError] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleMessage, setLifecycleMessage] = useState<string | null>(null);
  const [lifecycleMessageIsError, setLifecycleMessageIsError] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteEmailLinkSent, setDeleteEmailLinkSent] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!hasSession()) {
      router.replace('/');
      return;
    }

    let active = true;
    setActiveCategory('overview');
    setPageState('loading');
    setPageError('');
    setCalendar(null);
    setExperience(null);

    async function load() {
      try {
        const [systems, memberships, allSystems] = await Promise.all([getMyDailyLoginSystems(), getMySystemMemberships(), getGameSystems({ includeArchived: true })]);
        if (!active) return;
        const view = systems.find((entry) => entry.system.id === systemId);
        setManageableSystems(systems.filter((entry) => entry.can_manage));
        setAccess(memberships);
        if (!view?.can_manage) {
          setSystemView(null);
          setPageState('forbidden');
          return;
        }

        setSystemView(view);
        const selectedSystem = allSystems.systems.find((entry) => entry.id === systemId) ?? null;
        setGameSystem(selectedSystem);
        setSystemIsPublic(selectedSystem?.is_public ?? true);
        setPageState('ready');
        setCalendarLoading(true);
        setExperienceLoading(true);
        void getOwnerDailyLoginCalendar(systemId).then((data) => {
          if (active) setCalendar(data);
        }).catch((error) => {
          if (active) {
            setCalendarMessage(error instanceof Error ? error.message : 'Não foi possível carregar o calendário.');
            setCalendarMessageIsError(true);
          }
        }).finally(() => { if (active) setCalendarLoading(false); });
        void getOwnerExperienceSettings(systemId).then((data) => {
          if (active) setExperience(data);
        }).catch((error) => {
          if (active) {
            setExperienceMessage(error instanceof Error ? error.message : 'Não foi possível carregar as regras de XP.');
            setExperienceMessageIsError(true);
          }
        }).finally(() => { if (active) setExperienceLoading(false); });
      } catch (error) {
        if (!active) return;
        setPageError(error instanceof Error ? error.message : 'Não foi possível carregar o acesso ao sistema.');
        setPageState('error');
      }
    }
    void load();
    return () => { active = false; };
  }, [router, systemId, reloadKey]);

  function changeReward(weekday: number, field: 'item_id' | 'quantity' | 'currency_amount', value: string | number) {
    setCalendar((current) => {
      if (!current) return current;
      const existing = current.rewards.find((reward) => reward.weekday === weekday);
      const itemId = field === 'item_id' ? String(value) : existing?.item_id ?? '';
      const itemName = current.items.find((item) => item.id === itemId)?.name ?? '';
      const next = existing
        ? { ...existing, [field]: value, item_name: itemName }
        : { weekday, item_id: itemId, item_name: itemName, quantity: field === 'quantity' ? Number(value) : 1, currency_amount: field === 'currency_amount' ? Number(value) : 0 };
      return { ...current, rewards: [...current.rewards.filter((reward) => reward.weekday !== weekday), next].sort((a, b) => a.weekday - b.weekday) };
    });
  }

  async function saveCalendar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!calendar) return;
    const rewards = Array.from({ length: 7 }, (_, index) => calendar.rewards.find((reward) => reward.weekday === index + 1))
      .filter((reward): reward is NonNullable<typeof reward> => Boolean(reward))
      .map(({ weekday, item_id, quantity, currency_amount }) => ({ weekday, item_id, quantity, currency_amount: currency_amount ?? 0 }));
    if (rewards.length !== 7 || rewards.some((reward) => !reward.item_id || !Number.isInteger(reward.quantity) || reward.quantity < 1 || reward.quantity > 1_000_000 || !Number.isFinite(reward.currency_amount) || reward.currency_amount < 0 || reward.currency_amount > 9999999999.99 || Math.abs(reward.currency_amount * 100 - Math.round(reward.currency_amount * 100)) > 0.0001)) {
      setCalendarMessage('Escolha um item e uma quantidade válida para cada dia da semana.');
      setCalendarMessageIsError(true);
      return;
    }
    setCalendarSaving(true);
    setCalendarMessage(null);
    try {
      await saveOwnerDailyLoginCalendar(systemId, { rewards, is_active: calendar.is_active });
      setCalendarMessage('Calendário salvo.');
      setCalendarMessageIsError(false);
    } catch (error) {
      setCalendarMessage(error instanceof Error ? error.message : 'Não foi possível salvar o calendário.');
      setCalendarMessageIsError(true);
    } finally { setCalendarSaving(false); }
  }

  async function saveExperience(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!experience) return;
    setExperienceSaving(true);
    setExperienceMessage(null);
    try {
      const sources = experience.sources.map(({ id, ...source }) => ({ ...(id ? { id } : {}), ...source }));
      await saveOwnerExperienceSettings(systemId, { xp_per_level: experience.xp_per_level, sources });
      setExperienceMessage('Configuração de XP salva.');
      setExperienceMessageIsError(false);
    } catch (error) {
      setExperienceMessage(error instanceof Error ? error.message : 'Não foi possível salvar as regras de XP.');
      setExperienceMessageIsError(true);
    } finally { setExperienceSaving(false); }
  }

  async function assignModerator(targetSystemId: string, userId: string, isModerator: boolean) {
    setMembershipBusy(true);
    setMembershipMessage(null);
    try {
      await setSystemModerator(targetSystemId, userId, isModerator);
      setMembershipMessage(isModerator ? 'Cargo Mod concedido.' : 'Cargo Mod removido; a pessoa voltou a User.');
      setMembershipMessageIsError(false);
    } catch (error) {
      setMembershipMessage(error instanceof Error ? error.message : 'Não foi possível atualizar o cargo.');
      setMembershipMessageIsError(true);
    } finally { setMembershipBusy(false); }
  }

  async function changeSystemAvailability() {
    if (!systemView || !canEditOwnerSettings) return;
    const action = systemView.system.is_active ? 'archive' : 'activate';
    if (action === 'archive' && !window.confirm(`Desativar "${systemView.system.name}"? Os dados serão preservados e o sistema poderá ser reativado depois.`)) return;
    setLifecycleBusy(true);
    setLifecycleMessage(null);
    try {
      const result = await updateGameSystemLifecycle(systemId, action);
      setSystemView((current) => current ? { ...current, system: { ...current.system, is_active: result.is_active } } : current);
      setManageableSystems((current) => current.map((entry) => entry.system.id === systemId
        ? { ...entry, system: { ...entry.system, is_active: result.is_active } }
        : entry));
      setGameSystem((current) => current ? { ...current, is_active: result.is_active } : current);
      setLifecycleMessage(result.is_active ? 'Sistema reativado; ele voltou a ficar disponível para os jogadores.' : 'Sistema desativado. Os dados foram preservados.');
      setLifecycleMessageIsError(false);
    } catch (error) {
      setLifecycleMessage(error instanceof Error ? error.message : 'Não foi possível alterar a disponibilidade do sistema.');
      setLifecycleMessageIsError(true);
    } finally {
      setLifecycleBusy(false);
    }
  }

  async function permanentlyDeleteSystem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!systemView || !canEditOwnerSettings) return;
    if (deleteConfirmation.trim() !== systemView.system.name) return;
    setLifecycleBusy(true);
    setLifecycleMessage(null);
    try {
      await sendDeletionEmailLink(systemId, systemView.system.name);
      setDeleteEmailLinkSent(true);
      setLifecycleMessage('Enviamos um link de confirmação para o e-mail da sua conta. Abra-o no mesmo navegador para concluir a exclusão.');
      setLifecycleMessageIsError(false);
    } catch (error) {
      setLifecycleMessage(error instanceof Error ? error.message : 'Não foi possível enviar o link de confirmação.');
      setLifecycleMessageIsError(true);
    } finally {
      setLifecycleBusy(false);
    }
  }

  const selectedManageable = manageableSystems.find((entry) => entry.system.id === systemId);
  const membershipsForSystem = access ? { ...access, memberships: access.memberships.filter((membership) => membership.game_system_id === systemId) } : null;
  const canEditOwnerSettings = Boolean(access?.is_platform_admin || access?.memberships.some((membership) => membership.game_system_id === systemId && membership.role === 'owner'));
  const editorSystem: GameSystem | null = gameSystem ?? (systemView ? {
    id: systemId,
    slug: '',
    name: systemView.system.name,
    description: systemView.system.description ?? null,
    is_public: systemIsPublic,
    cover_image_path: null,
    cover_focus_x: 50,
    cover_focus_y: 50,
    tags: [],
    play_mode: 'text',
  } : null);

  function updateSystemDetails(updated: GameSystem) {
    setSystemIsPublic(updated.is_public ?? true);
    setGameSystem(updated);
    setSystemView((current) => current ? { ...current, system: { ...current.system, name: updated.name, description: updated.description } } : current);
    setManageableSystems((current) => current.map((entry) => entry.system.id === updated.id
      ? { ...entry, system: { ...entry.system, name: updated.name, description: updated.description } }
      : entry));
  }

  function selectCategory(category: ManagementCategory) {
    setActiveCategory(category);
  }

  function isVisibleCategory(category: ManagementCategory) {
    return category === activeCategory;
  }

  return <main className="system-management-page">
    <AppHeader activeItem="Meus Sistemas" backHref="/dashboard" backLabel="Voltar aos sistemas" />
    <div className="system-management-content">
      {pageState === 'loading' && <p className="system-management-state" role="status">Verificando acesso ao sistema…</p>}
      {pageState === 'error' && <section className="system-management-state"><h1>Não foi possível abrir o gerenciamento</h1><p role="alert">{pageError}</p><button className="button secondary" type="button" onClick={() => setReloadKey((key) => key + 1)}>Tentar novamente</button></section>}
      {pageState === 'forbidden' && <section className="system-management-state"><span className="system-management-eyebrow">ACESSO RESTRITO</span><h1>Você não pode gerenciar este sistema</h1><p>Somente o Owner do sistema ou um Admin global pode acessar estas configurações.</p><button className="button secondary" type="button" onClick={() => router.push('/dashboard')}>Voltar aos sistemas</button></section>}
      {pageState === 'ready' && systemView && <>
        <header className="system-management-header">
          <div>
            <p className="system-management-eyebrow">GERENCIAMENTO DO SISTEMA</p>
            <h1>{systemView.system.name}</h1>
            <p>Organize seu universo e prepare a próxima aventura.</p>
          </div>
          <div className="system-management-statuses" aria-label="Status do sistema">
            <span className={systemView.system.is_active ? 'system-management-status is-active' : 'system-management-status'}>{systemView.system.is_active ? 'Sistema ativo' : 'Sistema desativado'}</span>
            <span className="system-management-status">{systemIsPublic ? 'Público' : 'Privado'}</span>
          </div>
        </header>
        <div className="system-management-layout">
          <aside className="system-management-sidebar">
            <p className="system-management-nav-label">ESPAÇO DO SISTEMA</p>
            <nav className="system-management-nav" aria-label="Seções de gerenciamento">
              {managementSections.map(({ id, label, icon }) => <button key={id} className="system-management-nav-item" type="button" id={`management-tab-${id}`} aria-pressed={activeCategory === id} aria-controls={activeCategory === id ? id : undefined} onClick={() => selectCategory(id)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icon} /></svg>
                <span>{label}</span>
              </button>)}
            </nav>
            <div className="system-management-sidebar-note"><strong>Tudo no seu lugar</strong><p>Gerencie as regras, os jogadores e as experiências do seu sistema.</p></div>
          </aside>
          <div className="system-management-workspace">
            {isVisibleCategory('overview') && <section className="system-management-section" id="overview" aria-labelledby="management-heading-overview"><header className="system-management-section-heading"><h2 id="management-heading-overview">Informações do sistema</h2><p>Personalize a identidade e a apresentação do seu universo.</p></header>
              <div className="system-management-sheet-editor">
                <div><h3>Identidade e apresentação</h3><p>Estas informações ajudam os jogadores a conhecer o sistema.</p></div>
                {canEditOwnerSettings
                  ? editorSystem && <SystemDetailsEditor key={`${systemId}-${editorSystem.cover_image_path ?? 'no-cover'}-overview`} system={editorSystem} section="overview" onSaved={updateSystemDetails} />
                  : <p>Somente o Owner do sistema pode editar estas informações.</p>}
              </div>
            </section>}
            {isVisibleCategory('people') && <section className="system-management-section" id="people" aria-labelledby="management-heading-people"><header className="system-management-section-heading"><h2 id="management-heading-people">Pessoas e permissões</h2><p>Organize os participantes e os cargos de moderação.</p></header>
              {membershipsForSystem && <SystemMembershipCard access={membershipsForSystem} manageableSystems={selectedManageable ? [{ game_system_id: systemId, game_system_name: selectedManageable.system.name }] : []} busy={membershipBusy} message={membershipMessage} messageIsError={membershipMessageIsError} onAssign={(targetId, userId, isModerator) => void assignModerator(targetId, userId, isModerator)} />}
            </section>}
            {isVisibleCategory('game') && <section className="system-management-section" id="game" aria-labelledby="management-heading-game"><header className="system-management-section-heading"><h2 id="management-heading-game">Regras e progressão</h2><p>Configure a experiência e as recompensas dos jogadores.</p></header>
              <ExperienceAdminCard systems={[systemView]} selectedSystemId={systemId} settings={experience} loading={experienceLoading} saving={experienceSaving} message={experienceMessage} messageIsError={experienceMessageIsError} onSystemChange={() => undefined} onXpPerLevelChange={(amount) => setExperience((current) => current ? { ...current, xp_per_level: amount } : current)} onSourceChange={(index, field, value) => setExperience((current) => current ? { ...current, sources: current.sources.map((source, sourceIndex) => sourceIndex === index ? { ...source, [field]: value } : source) } : current)} onAddCustomSource={() => setExperience((current) => current ? { ...current, sources: addCustomExperienceSource(current.sources) } : current)} onRemoveCustomSource={(index) => setExperience((current) => current ? { ...current, sources: current.sources.filter((_, sourceIndex) => sourceIndex !== index) } : current)} onSave={(event) => void saveExperience(event)} />
              <DailyLoginAdminCard systems={[systemView]} selectedSystemId={systemId} calendar={calendar} loading={calendarLoading} saving={calendarSaving} message={calendarMessage} messageIsError={calendarMessageIsError} onSystemChange={() => undefined} onRewardChange={changeReward} onActiveChange={(isActive) => setCalendar((current) => current ? { ...current, is_active: isActive } : current)} onSave={(event) => void saveCalendar(event)} />
            </section>}
            {isVisibleCategory('store') && <section className="system-management-section" id="store" aria-labelledby="management-heading-store"><header className="system-management-section-heading"><h2 id="management-heading-store">Loja do sistema</h2><p>Gerencie o catálogo, os itens e as ofertas da sua loja.</p></header>
              <SystemStoreAdmin key={systemId} systemId={systemId} />
            </section>}
            {isVisibleCategory('sheet') && <section className="system-management-section" id="sheet" aria-labelledby="management-heading-sheet"><header className="system-management-section-heading"><h2 id="management-heading-sheet">Ficha de personagem</h2><p>Defina os campos e a estrutura das fichas do sistema.</p></header>
              <div className="system-management-sheet-editor">{canEditOwnerSettings ? <SystemSheetEditor systemId={systemId} systemName={systemView.system.name} /> : <p>Somente o Owner do sistema pode editar a ficha de personagem.</p>}</div>
            </section>}
            {isVisibleCategory('events') && <section className="system-management-section" id="events" aria-labelledby="management-heading-events"><header className="system-management-section-heading"><h2 id="management-heading-events">Eventos</h2><p>Prepare os próximos encontros e atividades do seu sistema.</p></header><SystemEventsCard systemId={systemId} canManage={canEditOwnerSettings} /></section>}
            {isVisibleCategory('community') && <section className="system-management-section system-management-future" id="community" aria-labelledby="management-heading-community"><header className="system-management-section-heading"><h2 id="management-heading-community">Comunidade</h2><p>Um espaço para as próximas ferramentas do seu grupo.</p></header><p>Anúncios e ferramentas para o grupo poderão ser organizados aqui quando estiverem disponíveis para gerenciamento.</p></section>}
            {isVisibleCategory('settings') && <section className="system-management-section" id="settings" aria-labelledby="management-heading-settings"><header className="system-management-section-heading"><h2 id="management-heading-settings">Configurações</h2><p>Controle o acesso e a disponibilidade do seu sistema.</p></header>
              <div className="system-management-sheet-editor">
                <div><h3>Acesso do sistema</h3></div>
                {canEditOwnerSettings
                  ? editorSystem && <SystemDetailsEditor key={`${systemId}-${editorSystem.cover_image_path ?? 'no-cover'}-settings`} system={editorSystem} section="settings" onSaved={updateSystemDetails} />
                  : <p>Somente o Owner do sistema pode editar estas informações.</p>}
              </div>
              <section className="system-management-lifecycle" aria-label="Disponibilidade do sistema">
                <div>
                  <h3>{systemView.system.is_active ? 'Sistema ativo' : 'Sistema desativado'}</h3>
                </div>
                {canEditOwnerSettings && <button className="button secondary" type="button" disabled={lifecycleBusy} onClick={() => void changeSystemAvailability()}>
                  {lifecycleBusy ? 'Salvando...' : systemView.system.is_active ? 'Desativar sistema' : 'Reativar sistema'}
                </button>}
              </section>
              <section className="system-management-danger-zone" aria-label="Excluir sistema permanentemente">
                <div>
                  <h3>Excluir sistema e dados</h3>
                </div>
                {canEditOwnerSettings
                  ? deleteEmailLinkSent
                    ? <p role="status">O link foi enviado. Conclua a confirmação pelo e-mail para excluir o sistema.</p>
                    : <form onSubmit={(event) => void permanentlyDeleteSystem(event)}>
                      <label htmlFor="delete-system-confirmation">Digite <strong>{systemView.system.name}</strong> para enviar um link de confirmação por e-mail</label>
                      <input id="delete-system-confirmation" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off" required disabled={lifecycleBusy} />
                      <button className="system-management-delete-button" type="submit" disabled={lifecycleBusy || deleteConfirmation.trim() !== systemView.system.name}>
                        {lifecycleBusy ? 'Enviando...' : 'Enviar link de confirmação'}
                      </button>
                    </form>
                  : <p>Somente o Owner do sistema ou um Admin global pode excluir este sistema.</p>}
              </section>
              {lifecycleMessage && <p className={lifecycleMessageIsError ? 'system-management-lifecycle-error' : 'system-management-lifecycle-success'} role={lifecycleMessageIsError ? 'alert' : 'status'}>{lifecycleMessage}</p>}
            </section>}
          </div>
        </div>
      </>}
    </div>
  </main>;
}
