'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
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
  type SystemMemberships,
} from '../../api';
import { hasSession } from '../../supabase-auth';
import { AppHeader } from '../shell/app-header';
import { DailyLoginAdminCard } from '../daily-login/daily-login-admin-card';
import { ExperienceAdminCard } from '../experience/experience-admin-card';
import { addCustomExperienceSource } from '../experience/experience-model';
import { SystemMembershipCard } from '../system-membership/system-membership-card';
import './system-management-page.css';

type PageState = 'loading' | 'ready' | 'forbidden' | 'error';

export function SystemManagementPage() {
  const { systemId } = useParams<{ systemId: string }>();
  const router = useRouter();
  const [pageState, setPageState] = useState<PageState>('loading');
  const [pageError, setPageError] = useState('');
  const [systemView, setSystemView] = useState<DailyLoginSystemView | null>(null);
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
        const [systems, memberships] = await Promise.all([getMyDailyLoginSystems(), getMySystemMemberships()]);
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

  function changeReward(weekday: number, field: 'item_id' | 'quantity', value: string | number) {
    setCalendar((current) => {
      if (!current) return current;
      const existing = current.rewards.find((reward) => reward.weekday === weekday);
      const itemId = field === 'item_id' ? String(value) : existing?.item_id ?? '';
      const itemName = current.items.find((item) => item.id === itemId)?.name ?? '';
      const next = existing
        ? { ...existing, [field]: value, item_name: itemName }
        : { weekday, item_id: itemId, item_name: itemName, quantity: field === 'quantity' ? Number(value) : 1 };
      return { ...current, rewards: [...current.rewards.filter((reward) => reward.weekday !== weekday), next].sort((a, b) => a.weekday - b.weekday) };
    });
  }

  async function saveCalendar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!calendar) return;
    const rewards = Array.from({ length: 7 }, (_, index) => calendar.rewards.find((reward) => reward.weekday === index + 1))
      .filter((reward): reward is NonNullable<typeof reward> => Boolean(reward))
      .map(({ weekday, item_id, quantity }) => ({ weekday, item_id, quantity }));
    if (rewards.length !== 7 || rewards.some((reward) => !reward.item_id || !Number.isInteger(reward.quantity) || reward.quantity < 1 || reward.quantity > 1_000_000)) {
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
          <div className="system-management-stats"><span><strong>2</strong> áreas disponíveis</span><span><strong>3</strong> ferramentas de gerenciamento</span></div>
        </header>
        <nav className="system-management-nav" aria-label="Seções de gerenciamento">
          <a href="#overview">Visão geral</a><a href="#people">Pessoas</a><a href="#game">Jogo</a><a href="#community">Comunidade</a><a href="#settings">Configurações</a>
        </nav>
        <section className="system-management-section" id="overview"><div className="system-management-section-heading"><span>01</span><div><p>PAINEL</p><h2>Visão geral</h2></div></div><p className="system-management-section-copy">Ajuste quem ajuda a administrar este sistema e configure as regras que afetam os personagens.</p></section>
        <section className="system-management-section" id="people"><div className="system-management-section-heading"><span>02</span><div><p>ACESSO</p><h2>Pessoas</h2></div></div>
          {membershipsForSystem && <SystemMembershipCard access={membershipsForSystem} manageableSystems={selectedManageable ? [{ game_system_id: systemId, game_system_name: selectedManageable.system.name }] : []} busy={membershipBusy} message={membershipMessage} messageIsError={membershipMessageIsError} onAssign={(targetId, userId, isModerator) => void assignModerator(targetId, userId, isModerator)} />}
        </section>
        <section className="system-management-section" id="game"><div className="system-management-section-heading"><span>03</span><div><p>REGRAS</p><h2>Jogo</h2></div></div>
          <ExperienceAdminCard systems={[systemView]} selectedSystemId={systemId} settings={experience} loading={experienceLoading} saving={experienceSaving} message={experienceMessage} messageIsError={experienceMessageIsError} onSystemChange={() => undefined} onXpPerLevelChange={(amount) => setExperience((current) => current ? { ...current, xp_per_level: amount } : current)} onSourceChange={(index, field, value) => setExperience((current) => current ? { ...current, sources: current.sources.map((source, sourceIndex) => sourceIndex === index ? { ...source, [field]: value } : source) } : current)} onAddCustomSource={() => setExperience((current) => current ? { ...current, sources: addCustomExperienceSource(current.sources) } : current)} onRemoveCustomSource={(index) => setExperience((current) => current ? { ...current, sources: current.sources.filter((_, sourceIndex) => sourceIndex !== index) } : current)} onSave={(event) => void saveExperience(event)} />
          <DailyLoginAdminCard systems={[systemView]} selectedSystemId={systemId} calendar={calendar} loading={calendarLoading} saving={calendarSaving} message={calendarMessage} messageIsError={calendarMessageIsError} onSystemChange={() => undefined} onRewardChange={changeReward} onActiveChange={(isActive) => setCalendar((current) => current ? { ...current, is_active: isActive } : current)} onSave={(event) => void saveCalendar(event)} />
        </section>
        <section className="system-management-section system-management-future" id="community"><div className="system-management-section-heading"><span>04</span><div><p>GRUPO</p><h2>Comunidade</h2></div></div><p>Anúncios e ferramentas para o grupo poderão ser organizados aqui quando estiverem disponíveis para gerenciamento.</p></section>
        <section className="system-management-section system-management-future" id="settings"><div className="system-management-section-heading"><span>05</span><div><p>SISTEMA</p><h2>Configurações</h2></div></div><p>As configurações gerais do sistema ainda não têm ferramentas de edição nesta central.</p></section>
      </>}
    </div>
  </main>;
}
