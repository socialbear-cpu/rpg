'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AccountCard, type AccountMode } from '../src/features/account/account-card';
import { ProfileCard, type ProfileFields } from '../src/features/profile/profile-card';
import { DailyLoginAdminCard } from '../src/features/daily-login/daily-login-admin-card';
import { DailyLoginCard } from '../src/features/daily-login/daily-login-card';
import { formatDailyLoginClaimSuccess } from '../src/features/daily-login/daily-login-messages';
import { ExperienceAdminCard } from '../src/features/experience/experience-admin-card';
import { TradingCard } from '../src/features/trading/trading-card';
import { AppHeader } from '../src/features/shell/app-header';
import { addCustomExperienceSource } from '../src/features/experience/experience-model';
import { SystemMembershipCard, SystemMembershipError } from '../src/features/system-membership/system-membership-card';
import './account-page.css';
import {
  checkHealth,
  claimDailyLoginReward,
  getMyDailyLoginSystems,
  getOwnerDailyLoginCalendar,
  getMyProfile,
  getMySystemMemberships,
  getOwnerExperienceSettings,
  saveOwnerDailyLoginCalendar,
  saveOwnerExperienceSettings as saveOwnerXpSettings,
  setSystemModerator,
  updateMyProfile,
  type DailyLoginOwnerCalendar,
  type DailyLoginSystemView,
  type ExperienceSettingsInput,
  type Profile,
  type SystemMemberships,
} from '../src/api';
import { missingSupabaseConfig } from '../src/config';
import {
  consumeAuthCallback,
  hasSession,
  requestPasswordReset,
  signIn,
  signOut,
  signUp,
  updatePassword,
} from '../src/supabase-auth';

type Notice = { message: string; error: boolean } | null;

const emptyProfile: ProfileFields = { displayName: '', avatarUrl: '', bio: '' };

export function RpgApp() {
  const router = useRouter();
  const [mode, setMode] = useState<AccountMode>('login');
  const [notice, setNotice] = useState<Notice>(null);
  const [health, setHealth] = useState<'checking' | 'ok' | 'bad'>('checking');
  const [authenticated, setAuthenticated] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [profile, setProfile] = useState<ProfileFields>(emptyProfile);
  const [authBusy, setAuthBusy] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [dailyLoginSystems, setDailyLoginSystems] = useState<DailyLoginSystemView[]>([]);
  const [dailyLoginLoading, setDailyLoginLoading] = useState(false);
  const [dailyLoginError, setDailyLoginError] = useState<string | null>(null);
  const [dailyLoginVersion, setDailyLoginVersion] = useState(0);
  const [claimingSystemId, setClaimingSystemId] = useState<string | null>(null);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [claimMessageIsError, setClaimMessageIsError] = useState(false);
  const [ownerSystemId, setOwnerSystemId] = useState('');
  const [ownerCalendar, setOwnerCalendar] = useState<DailyLoginOwnerCalendar | null>(null);
  const [ownerCalendarLoading, setOwnerCalendarLoading] = useState(false);
  const [ownerCalendarVersion, setOwnerCalendarVersion] = useState(0);
  const [ownerSaving, setOwnerSaving] = useState(false);
  const [ownerMessage, setOwnerMessage] = useState<string | null>(null);
  const [ownerMessageIsError, setOwnerMessageIsError] = useState(false);
  const [ownerExperienceSettings, setOwnerExperienceSettings] = useState<(ExperienceSettingsInput & { game_system_id: string }) | null>(null);
  const [ownerExperienceLoading, setOwnerExperienceLoading] = useState(false);
  const [ownerExperienceSaving, setOwnerExperienceSaving] = useState(false);
  const [ownerExperienceVersion, setOwnerExperienceVersion] = useState(0);
  const [ownerExperienceMessage, setOwnerExperienceMessage] = useState<string | null>(null);
  const [ownerExperienceMessageIsError, setOwnerExperienceMessageIsError] = useState(false);
  const [systemAccess, setSystemAccess] = useState<SystemMemberships | null>(null);
  const [systemAccessVersion, setSystemAccessVersion] = useState(0);
  const [systemMembershipBusy, setSystemMembershipBusy] = useState(false);
  const [systemMembershipMessage, setSystemMembershipMessage] = useState<string | null>(null);
  const [systemMembershipMessageIsError, setSystemMembershipMessageIsError] = useState(false);

  useEffect(() => {
    const missing = missingSupabaseConfig();
    if (missing.length) setNotice({ message: `Configure as variáveis NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY para habilitar cadastro e login. (${missing.join(' e ')})`, error: true });

    const callback = consumeAuthCallback();
    if (callback.recovery) setRecovery(true);
    else if (callback.error) setNotice({ message: `${callback.error} Informe seu e-mail e solicite outro link.`, error: true });
    setAuthenticated(hasSession());

    void checkHealth().then(() => setHealth('ok')).catch(() => setHealth('bad'));
  }, []);

  useEffect(() => {
    if (!authenticated) {
      setDailyLoginSystems([]);
      setDailyLoginError(null);
      setOwnerCalendar(null);
      setOwnerSystemId('');
      setOwnerExperienceSettings(null);
      setOwnerExperienceMessage(null);
      return;
    }

    let current = true;
    setDailyLoginLoading(true);
    setDailyLoginError(null);
    void getMyDailyLoginSystems().then((systems) => {
      if (current) setDailyLoginSystems(systems);
    }).catch((error) => {
      if (current) setDailyLoginError(error instanceof Error ? error.message : 'Não foi possível carregar o login diário.');
    }).finally(() => {
      if (current) setDailyLoginLoading(false);
    });
    return () => { current = false; };
  }, [authenticated, dailyLoginVersion]);

  useEffect(() => {
    if (!authenticated) {
      setSystemAccess(null);
      setSystemMembershipMessage(null);
      return;
    }
    let current = true;
    void getMySystemMemberships().then((access) => {
      if (current) setSystemAccess(access);
    }).catch((error) => {
      if (current) {
        setSystemAccess(null);
        setSystemMembershipMessage(error instanceof Error ? error.message : 'Não foi possível carregar os cargos por sistema.');
        setSystemMembershipMessageIsError(true);
      }
    });
    return () => { current = false; };
  }, [authenticated, systemAccessVersion]);

  useEffect(() => {
    const manageable = dailyLoginSystems.filter((entry) => entry.can_manage);
    if (!authenticated || manageable.length === 0) {
      setOwnerSystemId('');
      setOwnerCalendar(null);
      return;
    }
    if (!manageable.some((entry) => entry.system.id === ownerSystemId)) {
      setOwnerSystemId(manageable[0]!.system.id);
    }
  }, [authenticated, dailyLoginSystems, ownerSystemId]);

  useEffect(() => {
    if (!authenticated || !ownerSystemId) {
      setOwnerCalendar(null);
      return;
    }
    let current = true;
    setOwnerCalendarLoading(true);
    setOwnerMessage(null);
    void getOwnerDailyLoginCalendar(ownerSystemId).then((calendar) => {
      if (current) setOwnerCalendar(calendar);
    }).catch((error) => {
      if (current) {
        setOwnerCalendar(null);
        setOwnerMessage(error instanceof Error ? error.message : 'Não foi possível carregar o calendário.');
        setOwnerMessageIsError(true);
      }
    }).finally(() => {
      if (current) setOwnerCalendarLoading(false);
    });
    return () => { current = false; };
  }, [authenticated, ownerSystemId, ownerCalendarVersion]);

  useEffect(() => {
    if (!authenticated || !ownerSystemId) {
      setOwnerExperienceSettings(null);
      return;
    }
    let current = true;
    setOwnerExperienceLoading(true);
    setOwnerExperienceMessage(null);
    void getOwnerExperienceSettings(ownerSystemId).then((settings) => {
      if (current) setOwnerExperienceSettings(settings);
    }).catch((error) => {
      if (current) {
        setOwnerExperienceSettings(null);
        setOwnerExperienceMessage(error instanceof Error ? error.message : 'Não foi possível carregar as regras de XP.');
        setOwnerExperienceMessageIsError(true);
      }
    }).finally(() => {
      if (current) setOwnerExperienceLoading(false);
    });
    return () => { current = false; };
  }, [authenticated, ownerSystemId, ownerExperienceVersion]);

  const showNotice = (message: string, error = false) => setNotice({ message, error });
  const selectMode = (nextMode: AccountMode) => {
    setMode(nextMode);
    setNotice(null);
  };

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setAuthBusy(true);
    try {
      if (mode === 'signup') {
        const result = await signUp({ email: email.trim(), password, displayName: displayName.trim() });
        showNotice(result.access_token
          ? 'Conta criada e sessão iniciada. Agora carregue seu perfil.'
          : 'Cadastro recebido. Confirme seu e-mail para poder entrar.');
      } else {
        await signIn({ email: email.trim(), password });
        router.push('/dashboard');
      }
      setAuthenticated(hasSession());
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Não foi possível concluir a autenticação.', true);
    } finally {
      setAuthBusy(false);
    }
  }

  async function submitRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRecoveryBusy(true);
    try {
      await updatePassword(newPassword);
      setRecovery(false);
      setMode('login');
      showNotice('Senha atualizada. Entre com a nova senha.');
      setAuthenticated(hasSession());
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Não foi possível atualizar a senha.', true);
    } finally {
      setRecoveryBusy(false);
    }
  }

  async function logout() {
    try {
      await signOut();
      showNotice('Sessão encerrada.');
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Não foi possível encerrar a sessão.', true);
    }
    setAuthenticated(hasSession());
  }

  async function resetPassword() {
    if (!email.trim()) {
      showNotice('Informe seu e-mail antes de solicitar a recuperação.', true);
      return;
    }
    try {
      await requestPasswordReset(email.trim());
      showNotice('Se o e-mail estiver cadastrado, você receberá as instruções de recuperação.');
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Não foi possível solicitar a recuperação.', true);
    }
  }

  function applyProfile(value: Profile) {
    setProfile({ displayName: value.display_name ?? '', avatarUrl: value.avatar_url ?? '', bio: value.bio ?? '' });
  }

  async function loadProfile() {
    try {
      applyProfile(await getMyProfile());
      showNotice('Perfil carregado pela API.');
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Não foi possível carregar o perfil.', true);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileBusy(true);
    try {
      const updated = await updateMyProfile({
        display_name: profile.displayName,
        avatar_url: profile.avatarUrl.trim() || null,
        bio: profile.bio || null,
      });
      applyProfile(updated);
      showNotice('Perfil atualizado pela API.');
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Não foi possível salvar o perfil.', true);
    } finally {
      setProfileBusy(false);
    }
  }

  async function submitDailyLoginClaim(systemId: string, characterId: string) {
    setClaimingSystemId(systemId);
    setClaimMessage(null);
    try {
      const result = await claimDailyLoginReward(systemId, characterId);
      setClaimMessage(formatDailyLoginClaimSuccess(result));
      setClaimMessageIsError(false);
      setDailyLoginVersion((version) => version + 1);
    } catch (error) {
      setClaimMessage(error instanceof Error ? error.message : 'Não foi possível resgatar a recompensa.');
      setClaimMessageIsError(true);
    } finally {
      setClaimingSystemId(null);
    }
  }

  function changeOwnerReward(weekday: number, field: 'item_id' | 'quantity', value: string | number) {
    setOwnerCalendar((current) => {
      if (!current) return current;
      const existing = current.rewards.find((reward) => reward.weekday === weekday);
      const itemId = field === 'item_id' ? String(value) : existing?.item_id ?? '';
      const itemName = current.items.find((item) => item.id === itemId)?.name ?? '';
      const next = existing
        ? { ...existing, [field]: value, item_name: itemName }
        : { weekday, item_id: itemId, item_name: itemName, quantity: field === 'quantity' ? Number(value) : 1 };
      return {
        ...current,
        rewards: [...current.rewards.filter((reward) => reward.weekday !== weekday), next].sort((a, b) => a.weekday - b.weekday),
      };
    });
  }

  async function saveOwnerCalendar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ownerCalendar) return;
    const rewards = Array.from({ length: 7 }, (_, index) => ownerCalendar.rewards.find((reward) => reward.weekday === index + 1))
      .filter((reward): reward is NonNullable<typeof reward> => Boolean(reward))
      .map(({ weekday, item_id, quantity }) => ({ weekday, item_id, quantity }));
    if (rewards.length !== 7 || rewards.some((reward) => !reward.item_id || !Number.isInteger(reward.quantity) || reward.quantity < 1 || reward.quantity > 1_000_000)) {
      setOwnerMessage('Escolha um item e uma quantidade válida para cada dia da semana.');
      setOwnerMessageIsError(true);
      return;
    }
    setOwnerSaving(true);
    setOwnerMessage(null);
    try {
      await saveOwnerDailyLoginCalendar(ownerCalendar.system.id, { rewards, is_active: ownerCalendar.is_active });
      setOwnerMessage('Calendário salvo.');
      setOwnerMessageIsError(false);
      setOwnerCalendarVersion((version) => version + 1);
    } catch (error) {
      setOwnerMessage(error instanceof Error ? error.message : 'Não foi possível salvar o calendário.');
      setOwnerMessageIsError(true);
    } finally {
      setOwnerSaving(false);
    }
  }

  function changeOwnerExperienceThreshold(amount: number) {
    setOwnerExperienceSettings((current) => current ? { ...current, xp_per_level: amount } : current);
  }

  function changeOwnerExperienceSource(
    index: number,
    field: 'name' | 'award_amount' | 'is_enabled',
    value: string | number | boolean,
  ) {
    setOwnerExperienceSettings((current) => current ? {
      ...current,
      sources: current.sources.map((source, sourceIndex) => sourceIndex === index
        ? { ...source, [field]: value }
        : source),
    } : current);
  }

  function addOwnerCustomExperienceSource() {
    setOwnerExperienceSettings((current) => current ? {
      ...current,
      sources: addCustomExperienceSource(current.sources),
    } : current);
  }

  function removeOwnerCustomExperienceSource(index: number) {
    setOwnerExperienceSettings((current) => current ? {
      ...current,
      sources: current.sources.filter((source, sourceIndex) => sourceIndex !== index),
    } : current);
  }

  async function saveOwnerExperience(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ownerExperienceSettings) return;
    const sources = ownerExperienceSettings.sources.map(({ id, ...source }) => ({
      ...(id ? { id } : {}),
      ...source,
    }));
    setOwnerExperienceSaving(true);
    setOwnerExperienceMessage(null);
    try {
      await saveOwnerXpSettings(ownerExperienceSettings.game_system_id, {
        xp_per_level: ownerExperienceSettings.xp_per_level,
        sources,
      });
      setOwnerExperienceMessage('Configuração de XP salva.');
      setOwnerExperienceMessageIsError(false);
      setOwnerExperienceVersion((version) => version + 1);
    } catch (error) {
      setOwnerExperienceMessage(error instanceof Error ? error.message : 'Não foi possível salvar as regras de XP.');
      setOwnerExperienceMessageIsError(true);
    } finally {
      setOwnerExperienceSaving(false);
    }
  }

  async function assignSystemModerator(systemId: string, userId: string, isModerator: boolean) {
    setSystemMembershipBusy(true);
    setSystemMembershipMessage(null);
    try {
      await setSystemModerator(systemId, userId, isModerator);
      setSystemMembershipMessage(isModerator ? 'Cargo Mod concedido.' : 'Cargo Mod removido; a pessoa voltou a User.');
      setSystemMembershipMessageIsError(false);
      setSystemAccessVersion((version) => version + 1);
    } catch (error) {
      setSystemMembershipMessage(error instanceof Error ? error.message : 'Não foi possível atualizar o cargo.');
      setSystemMembershipMessageIsError(true);
    } finally {
      setSystemMembershipBusy(false);
    }
  }

  const accountCard = <AccountCard
    mode={mode}
    recovery={recovery}
    authenticated={authenticated}
    email={email}
    password={password}
    displayName={displayName}
    newPassword={newPassword}
    authBusy={authBusy}
    recoveryBusy={recoveryBusy}
    onModeChange={selectMode}
    onEmailChange={setEmail}
    onPasswordChange={setPassword}
    onDisplayNameChange={setDisplayName}
    onNewPasswordChange={setNewPassword}
    onSubmitAuth={submitAuth}
    onSubmitRecovery={submitRecovery}
    onResetPassword={() => void resetPassword()}
    onLogout={() => void logout()}
  />;

  if (!authenticated) {
    return (
      <main className={`auth-landing ${mode === 'signup' ? 'auth-landing-signup' : ''}`}>
        <section className="auth-story-panel">
          <a className="auth-brand" href="/" aria-label="Nexus RPG início">
            <span className="auth-brand-mark" aria-hidden="true">✧</span>
            <span>NEXUS <em>RPG</em></span>
          </a>
          <div className="auth-story-copy">
            <p className="auth-story-eyebrow">SUA PRÓXIMA AVENTURA COMEÇA AQUI</p>
            <h1>O seu mundo.<br /><span>As suas regras.</span></h1>
            <p>Crie sistemas, personalize fichas e reúna seu grupo para escrever histórias que só poderiam acontecer na sua mesa.</p>
          </div>
          <div className="auth-story-rune" aria-hidden="true"><span>✧</span><i /><b /></div>
          <div className="auth-story-footer"><span className="auth-live-dot" /> Um espaço para quem joga e cria RPG</div>
        </section>
        <section className="auth-form-panel" aria-label={mode === 'signup' ? 'Criar conta' : 'Entrar'}>
          <div className="auth-form-wrap">
            {notice && <div className={`notice${notice.error ? ' error' : ''}`} role="status" aria-live="polite">{notice.message}</div>}
            {accountCard}
            <p className="auth-form-footnote">Seus sistemas, personagens e aventuras em um só lugar.</p>
          </div>
          <footer className="auth-footer"><span>NEXUS RPG</span><span>Feito para as suas histórias</span></footer>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <AppHeader section="Minha conta">
        <div className="health"><span className={`dot ${health === 'ok' ? 'ok' : health === 'bad' ? 'bad' : ''}`} /><span>{health === 'checking' ? 'Verificando API…' : health === 'ok' ? 'API disponível' : 'API indisponível'}</span></div>
      </AppHeader>

      <section className="intro">
        <p className="eyebrow">NEXUS RPG</p>
        <h1>Continue sua aventura</h1>
        <p>Gerencie seu perfil e as ferramentas dos seus sistemas.</p>
      </section>

      {notice && <div className={`notice${notice.error ? ' error' : ''}`} role="status" aria-live="polite">{notice.message}</div>}

      <section className="layout">
        {accountCard}

        <ProfileCard
          profile={profile}
          authenticated={authenticated}
          profileBusy={profileBusy}
          onProfileChange={(field, value) => setProfile((current) => ({ ...current, [field]: value }))}
          onLoadProfile={() => void loadProfile()}
          onSaveProfile={saveProfile}
        />
      </section>

      {authenticated && <section className="daily-login-layout" aria-label="Login diário e configuração de recompensas">
        <DailyLoginCard
          systems={dailyLoginSystems}
          loading={dailyLoginLoading}
          claimingSystemId={claimingSystemId}
          message={claimMessage ?? dailyLoginError}
          messageIsError={claimMessage ? claimMessageIsError : Boolean(dailyLoginError)}
          onClaim={(systemId, characterId) => void submitDailyLoginClaim(systemId, characterId)}
        />
        {dailyLoginSystems.some((entry) => entry.can_manage) && <DailyLoginAdminCard
          systems={dailyLoginSystems}
          selectedSystemId={ownerSystemId}
          calendar={ownerCalendar}
          loading={ownerCalendarLoading}
          saving={ownerSaving}
          message={ownerMessage}
          messageIsError={ownerMessageIsError}
          onSystemChange={(systemId) => { setOwnerSystemId(systemId); setOwnerCalendar(null); }}
          onRewardChange={changeOwnerReward}
          onActiveChange={(isActive) => setOwnerCalendar((current) => current ? { ...current, is_active: isActive } : current)}
          onSave={saveOwnerCalendar}
        />}
        {dailyLoginSystems.some((entry) => entry.can_manage) && <ExperienceAdminCard
          systems={dailyLoginSystems}
          selectedSystemId={ownerSystemId}
          settings={ownerExperienceSettings}
          loading={ownerExperienceLoading}
          saving={ownerExperienceSaving}
          message={ownerExperienceMessage}
          messageIsError={ownerExperienceMessageIsError}
          onSystemChange={(systemId) => {
            setOwnerSystemId(systemId);
            setOwnerExperienceSettings(null);
          }}
          onXpPerLevelChange={changeOwnerExperienceThreshold}
          onSourceChange={changeOwnerExperienceSource}
          onAddCustomSource={addOwnerCustomExperienceSource}
          onRemoveCustomSource={removeOwnerCustomExperienceSource}
          onSave={saveOwnerExperience}
        />}
      </section>}
      {authenticated && <TradingCard systems={dailyLoginSystems} systemsLoading={dailyLoginLoading} />}
      {authenticated && systemAccess && <SystemMembershipCard
        access={systemAccess}
        busy={systemMembershipBusy}
        message={systemMembershipMessage}
        messageIsError={systemMembershipMessageIsError}
        onAssign={(systemId, userId, isModerator) => void assignSystemModerator(systemId, userId, isModerator)}
      />}
      {authenticated && !systemAccess && systemMembershipMessage && <SystemMembershipError
        message={systemMembershipMessage}
        onRetry={() => { setSystemMembershipMessage(null); setSystemAccessVersion((version) => version + 1); }}
      />}
      <footer><span>NEXUS RPG</span><span>Uma plataforma para as suas aventuras</span></footer>
    </main>
  );
}
