'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getGameSystemCoverUrl,
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
import { addCustomExperienceSource } from '../experience/experience-model';
import { SystemMembershipCard } from '../system-membership/system-membership-card';
import { SystemSheetEditor } from '../system-creation/system-sheet-editor';
import { SystemDetailsEditor } from './system-details-editor';
import { BookCategory } from './book-category';
import './system-management-page.css';
import '../system-creation/system-creation.css';
import './system-management-codex.css';

type PageState = 'loading' | 'ready' | 'forbidden' | 'error';
type ManagementCategory = 'overview' | 'people' | 'game' | 'store' | 'sheet' | 'community' | 'settings';

export function SystemManagementPage() {
  const { systemId } = useParams<{ systemId: string }>();
  const router = useRouter();
  const [pageState, setPageState] = useState<PageState>('loading');
  const [activeCategory, setActiveCategory] = useState<ManagementCategory>('overview');
  const [previousCategory, setPreviousCategory] = useState<ManagementCategory | null>(null);
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
    setPreviousCategory(null);
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
  const systemCoverUrl = getGameSystemCoverUrl(gameSystem?.cover_image_path);
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
    if (category === activeCategory) return;
    setPreviousCategory(activeCategory);
    setActiveCategory(category);
  }

  function isVisibleCategory(category: ManagementCategory) {
    return category === activeCategory || category === previousCategory;
  }

  function categoryPageClass(category: ManagementCategory) {
    return `system-management-section ${category === previousCategory ? 'system-management-book-previous-page' : 'system-management-book-current-page'}`;
  }

  return <main className="system-management-page">
    <AppHeader activeItem="Meus Sistemas" backHref="/dashboard" backLabel="Voltar aos sistemas" />
    <div className="system-management-content">
      {pageState === 'loading' && <p className="system-management-state" role="status">Verificando acesso ao sistema…</p>}
      {pageState === 'error' && <section className="system-management-state"><h1>Não foi possível abrir o gerenciamento</h1><p role="alert">{pageError}</p><button className="button secondary" type="button" onClick={() => setReloadKey((key) => key + 1)}>Tentar novamente</button></section>}
      {pageState === 'forbidden' && <section className="system-management-state"><span className="system-management-eyebrow">ACESSO RESTRITO</span><h1>Você não pode gerenciar este sistema</h1><p>Somente o Owner do sistema ou um Admin global pode acessar estas configurações.</p><button className="button secondary" type="button" onClick={() => router.push('/dashboard')}>Voltar aos sistemas</button></section>}
      {pageState === 'ready' && systemView && <>
        <div className={`system-management-book ${previousCategory ? 'system-management-book-open' : ''}`}>
          <svg className="system-management-book-binding" viewBox="0 0 1200 800" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id="codex-paper-left"><stop stopColor="#201c2a" /><stop offset=".85" stopColor="#211c2b" /><stop offset="1" stopColor="#100e17" /></linearGradient>
              <linearGradient id="codex-paper-right"><stop stopColor="#100e17" /><stop offset=".08" stopColor="#211b2b" /><stop offset="1" stopColor="#1d1926" /></linearGradient>
            </defs>
            <path d="M26 16Q310 0 600 30Q890 0 1174 16Q1196 18 1196 44V766Q1196 794 1172 790Q880 768 600 796Q320 768 28 790Q4 794 4 766V44Q4 18 26 16Z" fill="#100e16" stroke="#493d56" />
            <path d="M30 10Q320 -4 600 25V780Q320 752 30 774Q12 776 12 754V36Q12 12 30 10Z" fill="url(#codex-paper-left)" stroke="#63516f" strokeOpacity=".35" />
            <path d="M600 25Q880 -4 1170 10Q1188 12 1188 36V754Q1188 776 1170 774Q880 752 600 780Z" fill="url(#codex-paper-right)" stroke="#63516f" strokeOpacity=".35" />
            <path d="M22 760Q320 742 590 774M610 774Q880 742 1178 760M22 768Q320 750 590 782M610 782Q880 750 1178 768" fill="none" stroke="#9d80ad" strokeOpacity=".18" />
          </svg>
          <nav className="system-management-nav" aria-label="Seções de gerenciamento" role="tablist">
            <button className="nexus-tab" type="button" role="tab" id="management-tab-overview" aria-selected={activeCategory === 'overview'} aria-controls="overview" onClick={() => selectCategory('overview')}>Visão geral</button>
            <button className="nexus-tab" type="button" role="tab" id="management-tab-people" aria-selected={activeCategory === 'people'} aria-controls="people" onClick={() => selectCategory('people')}>Pessoas</button>
            <button className="nexus-tab" type="button" role="tab" id="management-tab-game" aria-selected={activeCategory === 'game'} aria-controls="game" onClick={() => selectCategory('game')}>Jogo</button>
            <button className="nexus-tab" type="button" role="tab" id="management-tab-store" aria-selected={activeCategory === 'store'} aria-controls="store" onClick={() => selectCategory('store')}>Loja</button>
            <button className="nexus-tab" type="button" role="tab" id="management-tab-sheet" aria-selected={activeCategory === 'sheet'} aria-controls="sheet" onClick={() => selectCategory('sheet')}>Ficha</button>
            <button className="nexus-tab" type="button" role="tab" id="management-tab-community" aria-selected={activeCategory === 'community'} aria-controls="community" onClick={() => selectCategory('community')}>Comunidade</button>
            <button className="nexus-tab" type="button" role="tab" id="management-tab-settings" aria-selected={activeCategory === 'settings'} aria-controls="settings" onClick={() => selectCategory('settings')}>Configurações</button>
          </nav>
          {!previousCategory && <aside className="system-management-book-identity" aria-label={`Sobre ${systemView.system.name}`}>
            <span className="system-management-eyebrow">CÓDEX DO SISTEMA</span>
            <h1>{systemView.system.name}</h1>
            {(gameSystem?.description ?? systemView.system.description) && <p>{gameSystem?.description ?? systemView.system.description}</p>}
            <div className="system-management-book-art" aria-hidden="true">
              {systemCoverUrl
                ? <img src={systemCoverUrl} alt="" style={{ objectPosition: `${gameSystem?.cover_focus_x ?? 50}% ${gameSystem?.cover_focus_y ?? 50}%` }} />
                : <img src="/images/codex-landscape.png" alt="" />}
            </div>
          </aside>}
          <div className="system-management-book-page">
        {isVisibleCategory('overview') && <BookCategory className={categoryPageClass('overview')} id="overview" role="tabpanel" aria-labelledby="management-tab-overview" aria-label={previousCategory === 'overview' ? 'Visão geral, página anterior somente para consulta' : undefined} inert={previousCategory === 'overview'}><div className="system-management-section-heading"><span aria-hidden="true">✧</span><div><p>CAPÍTULO I · PAINEL</p><h2>Visão geral</h2></div></div>
          <p className="system-management-section-copy">Edite as informações e a apresentação principal do sistema.</p>
          <div className="system-management-sheet-editor">
            <div><h3>Informações básicas</h3><p>Atualize o nome, a descrição, a modalidade, as etiquetas e a capa do sistema.</p></div>
            {canEditOwnerSettings
              ? editorSystem && <SystemDetailsEditor key={`${systemId}-${editorSystem.cover_image_path ?? 'no-cover'}-overview`} system={editorSystem} section="overview" onSaved={updateSystemDetails} />
              : <p>Somente o Owner do sistema pode editar estas informações.</p>}
          </div>
        </BookCategory>}
        {isVisibleCategory('people') && <BookCategory className={categoryPageClass('people')} id="people" role="tabpanel" aria-labelledby="management-tab-people" aria-label={previousCategory === 'people' ? 'Pessoas, página anterior somente para consulta' : undefined} inert={previousCategory === 'people'}><div className="system-management-section-heading"><span aria-hidden="true">✧</span><div><p>CAPÍTULO II · ACESSO</p><h2>Pessoas</h2></div></div>
          {membershipsForSystem && <SystemMembershipCard access={membershipsForSystem} manageableSystems={selectedManageable ? [{ game_system_id: systemId, game_system_name: selectedManageable.system.name }] : []} busy={membershipBusy} message={membershipMessage} messageIsError={membershipMessageIsError} onAssign={(targetId, userId, isModerator) => void assignModerator(targetId, userId, isModerator)} />}
        </BookCategory>}
        {isVisibleCategory('game') && <BookCategory className={categoryPageClass('game')} id="game" role="tabpanel" aria-labelledby="management-tab-game" aria-label={previousCategory === 'game' ? 'Jogo, página anterior somente para consulta' : undefined} inert={previousCategory === 'game'}><div className="system-management-section-heading"><span aria-hidden="true">✧</span><div><p>CAPÍTULO III · REGRAS</p><h2>Jogo</h2></div></div>
          <ExperienceAdminCard systems={[systemView]} selectedSystemId={systemId} settings={experience} loading={experienceLoading} saving={experienceSaving} message={experienceMessage} messageIsError={experienceMessageIsError} onSystemChange={() => undefined} onXpPerLevelChange={(amount) => setExperience((current) => current ? { ...current, xp_per_level: amount } : current)} onSourceChange={(index, field, value) => setExperience((current) => current ? { ...current, sources: current.sources.map((source, sourceIndex) => sourceIndex === index ? { ...source, [field]: value } : source) } : current)} onAddCustomSource={() => setExperience((current) => current ? { ...current, sources: addCustomExperienceSource(current.sources) } : current)} onRemoveCustomSource={(index) => setExperience((current) => current ? { ...current, sources: current.sources.filter((_, sourceIndex) => sourceIndex !== index) } : current)} onSave={(event) => void saveExperience(event)} />
          <DailyLoginAdminCard systems={[systemView]} selectedSystemId={systemId} calendar={calendar} loading={calendarLoading} saving={calendarSaving} message={calendarMessage} messageIsError={calendarMessageIsError} onSystemChange={() => undefined} onRewardChange={changeReward} onActiveChange={(isActive) => setCalendar((current) => current ? { ...current, is_active: isActive } : current)} onSave={(event) => void saveCalendar(event)} />
        </BookCategory>}
        {isVisibleCategory('store') && <BookCategory className={categoryPageClass('store')} id="store" role="tabpanel" aria-labelledby="management-tab-store" aria-label={previousCategory === 'store' ? 'Loja, página anterior somente para consulta' : undefined} inert={previousCategory === 'store'}><div className="system-management-section-heading"><span aria-hidden="true">✧</span><div><p>CAPÍTULO IV · COMÉRCIO</p><h2>Loja</h2></div></div>
          <SystemStoreAdmin key={systemId} systemId={systemId} />
        </BookCategory>}
        {isVisibleCategory('sheet') && <BookCategory className={categoryPageClass('sheet')} id="sheet" role="tabpanel" aria-labelledby="management-tab-sheet" aria-label={previousCategory === 'sheet' ? 'Ficha, página anterior somente para consulta' : undefined} inert={previousCategory === 'sheet'}><div className="system-management-section-heading"><span aria-hidden="true">✧</span><div><p>CAPÍTULO V · PERSONAGENS</p><h2>Ficha</h2></div></div>
          <div className="system-management-sheet-editor">{canEditOwnerSettings ? <SystemSheetEditor systemId={systemId} systemName={systemView.system.name} /> : <p>Somente o Owner do sistema pode editar a ficha de personagem.</p>}</div>
        </BookCategory>}
        {isVisibleCategory('community') && <BookCategory className={`${categoryPageClass('community')} system-management-future`} id="community" role="tabpanel" aria-labelledby="management-tab-community" aria-label={previousCategory === 'community' ? 'Comunidade, página anterior somente para consulta' : undefined} inert={previousCategory === 'community'}><div className="system-management-section-heading"><span aria-hidden="true">✧</span><div><p>CAPÍTULO VI · GRUPO</p><h2>Comunidade</h2></div></div><p>Anúncios e ferramentas para o grupo poderão ser organizados aqui quando estiverem disponíveis para gerenciamento.</p></BookCategory>}
        {isVisibleCategory('settings') && <BookCategory className={categoryPageClass('settings')} id="settings" role="tabpanel" aria-labelledby="management-tab-settings" aria-label={previousCategory === 'settings' ? 'Configurações, página anterior somente para consulta' : undefined} inert={previousCategory === 'settings'}><div className="system-management-section-heading"><span aria-hidden="true">✧</span><div><p>CAPÍTULO VII · SISTEMA</p><h2>Configurações</h2></div></div>
          <div className="system-management-sheet-editor">
            <div><h3>Acesso do sistema</h3><p>Defina a visibilidade e a senha de acesso.</p></div>
            {canEditOwnerSettings
              ? editorSystem && <SystemDetailsEditor key={`${systemId}-${editorSystem.cover_image_path ?? 'no-cover'}-settings`} system={editorSystem} section="settings" onSaved={updateSystemDetails} />
              : <p>Somente o Owner do sistema pode editar estas informações.</p>}
          </div>
          <section className="system-management-lifecycle" aria-label="Disponibilidade do sistema">
            <div>
              <span className="system-management-eyebrow">ACESSO DOS JOGADORES</span>
              <h3>{systemView.system.is_active ? 'Sistema ativo' : 'Sistema desativado'}</h3>
              <p>{systemView.system.is_active
                ? 'Desativar oculta o sistema para novos jogadores, sem apagar campanhas, personagens ou configurações.'
                : 'O sistema está oculto para os jogadores. Reative-o para permitir novos acessos.'}</p>
            </div>
            {canEditOwnerSettings && <button className="button secondary" type="button" disabled={lifecycleBusy} onClick={() => void changeSystemAvailability()}>
              {lifecycleBusy ? 'Salvando...' : systemView.system.is_active ? 'Desativar sistema' : 'Reativar sistema'}
            </button>}
          </section>
          <section className="system-management-danger-zone" aria-label="Excluir sistema permanentemente">
            <div>
              <span className="system-management-eyebrow">AÇÃO IRREVERSÍVEL</span>
              <h3>Excluir sistema e dados</h3>
              <p>Apaga permanentemente este sistema, suas campanhas, personagens, inventários, itens, compras e históricos relacionados. Essa ação não pode ser desfeita.</p>
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
        </BookCategory>}
          </div>
        </div>
      </>}
    </div>
  </main>;
}
