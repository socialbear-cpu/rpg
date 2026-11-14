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
  type DailyLoginOwnerCalendar,
  type DailyLoginSystemView,
  type ExperienceSettingsInput,
  type GameSystem,
  type SystemMemberships,
} from '../../api';
import { hasSession } from '../../supabase-auth';
import { AppHeader } from '../shell/app-header';
import { DailyLoginAdminCard } from '../daily-login/daily-login-admin-card';
import { SystemStoreAdmin } from '../store/store-admin-card';
import { ExperienceAdminCard } from '../experience/experience-admin-card';
import { addCustomExperienceSource } from '../experience/experience-model';
import { SystemMembershipCard } from '../system-membership/system-membership-card';
import { SystemSheetEditor } from '../system-creation/system-sheet-editor';
import { SystemDetailsEditor } from './system-details-editor';
import './system-management-page.css';
import '../system-creation/system-creation.css';

type PageState = 'loading' | 'ready' | 'forbidden' | 'error';
type ManagementCategory = 'overview' | 'people' | 'game' | 'store' | 'sheet' | 'community' | 'settings';

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
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!hasSession()) {
      router.replace('/');
      return;
    }

    let active = true;
    setPageState('loading');
    setPageError('');
    setCalendar(null);
    setExperience(null);

    async function load() {
      try {
        const [systems, memberships, allSystems] = await Promise.all([getMyDailyLoginSystems(), getMySystemMemberships(), getGameSystems()]);
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

  return <main className="system-management-page">
    <AppHeader activeItem="Meus Sistemas" backHref="/dashboard" backLabel="Voltar aos sistemas" />
    <div className="system-management-content">
      {pageState === 'loading' && <p className="system-management-state" role="status">Verificando acesso ao sistema…</p>}
      {pageState === 'error' && <section className="system-management-state"><h1>Não foi possível abrir o gerenciamento</h1><p role="alert">{pageError}</p><button className="button secondary" type="button" onClick={() => setReloadKey((key) => key + 1)}>Tentar novamente</button></section>}
      {pageState === 'forbidden' && <section className="system-management-state"><span className="system-management-eyebrow">ACESSO RESTRITO</span><h1>Você não pode gerenciar este sistema</h1><p>Somente o Owner do sistema ou um Admin global pode acessar estas configurações.</p><button className="button secondary" type="button" onClick={() => router.push('/dashboard')}>Voltar aos sistemas</button></section>}
      {pageState === 'ready' && systemView && <>
        <header className="system-management-hero">
          <span className="system-management-eyebrow">CENTRAL DO SISTEMA</span>
          <h1>{systemView.system.name}</h1>
          <p>Gerencie as regras e os recursos deste mundo.</p>
          <div className="system-management-stats"><span><strong>7</strong> categorias</span><span><strong>6</strong> ferramentas de gerenciamento</span></div>
        </header>
        <nav className="system-management-nav" aria-label="Seções de gerenciamento" role="tablist">
          <button className="nexus-tab" type="button" role="tab" id="management-tab-overview" aria-selected={activeCategory === 'overview'} aria-controls="overview" onClick={() => setActiveCategory('overview')}>Visão geral</button>
          <button className="nexus-tab" type="button" role="tab" id="management-tab-people" aria-selected={activeCategory === 'people'} aria-controls="people" onClick={() => setActiveCategory('people')}>Pessoas</button>
          <button className="nexus-tab" type="button" role="tab" id="management-tab-game" aria-selected={activeCategory === 'game'} aria-controls="game" onClick={() => setActiveCategory('game')}>Jogo</button>
          <button className="nexus-tab" type="button" role="tab" id="management-tab-store" aria-selected={activeCategory === 'store'} aria-controls="store" onClick={() => setActiveCategory('store')}>Loja</button>
          <button className="nexus-tab" type="button" role="tab" id="management-tab-sheet" aria-selected={activeCategory === 'sheet'} aria-controls="sheet" onClick={() => setActiveCategory('sheet')}>Ficha</button>
          <button className="nexus-tab" type="button" role="tab" id="management-tab-community" aria-selected={activeCategory === 'community'} aria-controls="community" onClick={() => setActiveCategory('community')}>Comunidade</button>
          <button className="nexus-tab" type="button" role="tab" id="management-tab-settings" aria-selected={activeCategory === 'settings'} aria-controls="settings" onClick={() => setActiveCategory('settings')}>Configurações</button>
        </nav>
        {activeCategory === 'overview' && <section className="system-management-section" id="overview" role="tabpanel" aria-labelledby="management-tab-overview"><div className="system-management-section-heading"><span>01</span><div><p>PAINEL</p><h2>Visão geral</h2></div></div><p className="system-management-section-copy">Ajuste quem ajuda a administrar este sistema e configure as regras que afetam os personagens.</p></section>}
        {activeCategory === 'people' && <section className="system-management-section" id="people" role="tabpanel" aria-labelledby="management-tab-people"><div className="system-management-section-heading"><span>02</span><div><p>ACESSO</p><h2>Pessoas</h2></div></div>
          {membershipsForSystem && <SystemMembershipCard access={membershipsForSystem} manageableSystems={selectedManageable ? [{ game_system_id: systemId, game_system_name: selectedManageable.system.name }] : []} busy={membershipBusy} message={membershipMessage} messageIsError={membershipMessageIsError} onAssign={(targetId, userId, isModerator) => void assignModerator(targetId, userId, isModerator)} />}
        </section>}
        {activeCategory === 'game' && <section className="system-management-section" id="game" role="tabpanel" aria-labelledby="management-tab-game"><div className="system-management-section-heading"><span>03</span><div><p>REGRAS</p><h2>Jogo</h2></div></div>
          <ExperienceAdminCard systems={[systemView]} selectedSystemId={systemId} settings={experience} loading={experienceLoading} saving={experienceSaving} message={experienceMessage} messageIsError={experienceMessageIsError} onSystemChange={() => undefined} onXpPerLevelChange={(amount) => setExperience((current) => current ? { ...current, xp_per_level: amount } : current)} onSourceChange={(index, field, value) => setExperience((current) => current ? { ...current, sources: current.sources.map((source, sourceIndex) => sourceIndex === index ? { ...source, [field]: value } : source) } : current)} onAddCustomSource={() => setExperience((current) => current ? { ...current, sources: addCustomExperienceSource(current.sources) } : current)} onRemoveCustomSource={(index) => setExperience((current) => current ? { ...current, sources: current.sources.filter((_, sourceIndex) => sourceIndex !== index) } : current)} onSave={(event) => void saveExperience(event)} />
          <DailyLoginAdminCard systems={[systemView]} selectedSystemId={systemId} calendar={calendar} loading={calendarLoading} saving={calendarSaving} message={calendarMessage} messageIsError={calendarMessageIsError} onSystemChange={() => undefined} onRewardChange={changeReward} onActiveChange={(isActive) => setCalendar((current) => current ? { ...current, is_active: isActive } : current)} onSave={(event) => void saveCalendar(event)} />
        </section>}
        {activeCategory === 'store' && <section className="system-management-section" id="store" role="tabpanel" aria-labelledby="management-tab-store"><div className="system-management-section-heading"><span>04</span><div><p>COMÉRCIO</p><h2>Loja</h2></div></div>
          <SystemStoreAdmin key={systemId} systemId={systemId} />
        </section>}
        {activeCategory === 'sheet' && <section className="system-management-section" id="sheet" role="tabpanel" aria-labelledby="management-tab-sheet"><div className="system-management-section-heading"><span>05</span><div><p>PERSONAGENS</p><h2>Ficha</h2></div></div>
          <div className="system-management-sheet-editor">{canEditOwnerSettings ? <SystemSheetEditor systemId={systemId} systemName={systemView.system.name} /> : <p>Somente o Owner do sistema pode editar a ficha de personagem.</p>}</div>
        </section>}
        {activeCategory === 'community' && <section className="system-management-section system-management-future" id="community" role="tabpanel" aria-labelledby="management-tab-community"><div className="system-management-section-heading"><span>06</span><div><p>GRUPO</p><h2>Comunidade</h2></div></div><p>Anúncios e ferramentas para o grupo poderão ser organizados aqui quando estiverem disponíveis para gerenciamento.</p></section>}
        {activeCategory === 'settings' && <section className="system-management-section" id="settings" role="tabpanel" aria-labelledby="management-tab-settings"><div className="system-management-section-heading"><span>07</span><div><p>SISTEMA</p><h2>Configurações</h2></div></div>
          <div className="system-management-sheet-editor">
            <div><h3>Informações básicas</h3><p>Atualize o nome e a descrição do sistema.</p></div>
            {canEditOwnerSettings
              ? editorSystem && <SystemDetailsEditor key={systemId} system={editorSystem} onSaved={updateSystemDetails} />
              : <p>Somente o Owner do sistema pode editar estas informações.</p>}
          </div>
        </section>}
      </>}
    </div>
  </main>;
}
