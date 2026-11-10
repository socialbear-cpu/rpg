'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { AccountCard, type AccountMode } from '../src/features/account/account-card';
import { ProfileCard, type ProfileFields } from '../src/features/profile/profile-card';
import { checkHealth, getMyProfile, updateMyProfile, type Profile } from '../src/api';
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

  useEffect(() => {
    const missing = missingSupabaseConfig();
    if (missing.length) setNotice({ message: `Configure as variáveis NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY para habilitar cadastro e login. (${missing.join(' e ')})`, error: true });

    const callback = consumeAuthCallback();
    if (callback.recovery) setRecovery(true);
    else if (callback.error) setNotice({ message: `${callback.error} Informe seu e-mail e solicite outro link.`, error: true });
    setAuthenticated(hasSession());

    void checkHealth().then(() => setHealth('ok')).catch(() => setHealth('bad'));
  }, []);

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
        showNotice('Login realizado. Carregue seu perfil para validar a API.');
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

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="RPG início"><span className="brand-mark">R</span><span>RPG <small>ÁREA DE VALIDAÇÃO</small></span></a>
        <div className="health"><span className={`dot ${health === 'ok' ? 'ok' : health === 'bad' ? 'bad' : ''}`} /><span>{health === 'checking' ? 'Verificando API…' : health === 'ok' ? 'API disponível' : 'API indisponível'}</span></div>
      </header>

      <section className="intro">
        <p className="eyebrow">FERRAMENTA INTERNA</p>
        <h1>Autenticação e perfil</h1>
        <p>Interface para validar cadastro, login e o perfil do usuário pela API na mesma aplicação.</p>
      </section>

      {notice && <div className={`notice${notice.error ? ' error' : ''}`} role="status" aria-live="polite">{notice.message}</div>}

      <section className="layout">
        <AccountCard
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
        />

        <ProfileCard
          profile={profile}
          authenticated={authenticated}
          profileBusy={profileBusy}
          onProfileChange={(field, value) => setProfile((current) => ({ ...current, [field]: value }))}
          onLoadProfile={() => void loadProfile()}
          onSaveProfile={saveProfile}
        />
      </section>
      <footer><span>RPG · Backend validation</span><span>Sem chave secreta no navegador</span></footer>
    </main>
  );
}
