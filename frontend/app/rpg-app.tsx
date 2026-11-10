'use client';

import { useEffect, useState, type FormEvent } from 'react';
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

type Mode = 'login' | 'signup';
type Notice = { message: string; error: boolean } | null;
type ProfileFields = { displayName: string; avatarUrl: string; bio: string };

const emptyProfile: ProfileFields = { displayName: '', avatarUrl: '', bio: '' };

export function RpgApp() {
  const [mode, setMode] = useState<Mode>('login');
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
  const selectMode = (nextMode: Mode) => {
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
        <article className="card auth-card">
          <div className="section-heading"><div><p className="eyebrow">CONTA</p><h2>Acessar</h2></div><span className="step">01</span></div>
          {!recovery && <div className="tabs" role="tablist" aria-label="Acesso à conta">
            <button className={`tab${mode === 'login' ? ' active' : ''}`} id="tab-login" type="button" role="tab" aria-selected={mode === 'login'} aria-controls="panel-auth" onClick={() => selectMode('login')}>Entrar</button>
            <button className={`tab${mode === 'signup' ? ' active' : ''}`} id="tab-signup" type="button" role="tab" aria-selected={mode === 'signup'} aria-controls="panel-auth" onClick={() => selectMode('signup')}>Criar conta</button>
          </div>}
          <div id="panel-auth">
            {recovery ? <form className="form" autoComplete="off" onSubmit={submitRecovery}>
              <p className="card-copy">Defina uma nova senha para concluir a recuperação da conta.</p>
              <label>Nova senha<input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" minLength={6} autoComplete="new-password" required placeholder="Mínimo de 6 caracteres" /></label>
              <button className="button primary" type="submit" disabled={recoveryBusy}>{recoveryBusy ? 'Atualizando…' : 'Atualizar senha'}</button>
            </form> : <form className="form" autoComplete="on" onSubmit={submitAuth}>
              {mode === 'signup' && <label>Nome de exibição<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} type="text" maxLength={80} autoComplete="nickname" placeholder="Como devemos chamar você?" required /></label>}
              <label>E-mail<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required placeholder="voce@exemplo.com" /></label>
              <label>Senha<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={6} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required placeholder="Mínimo de 6 caracteres" /></label>
              <button className="button primary" type="submit" disabled={authBusy}>{authBusy ? (mode === 'signup' ? 'Criando…' : 'Entrando…') : mode === 'signup' ? 'Criar conta' : 'Entrar'}</button>
            </form>}
          </div>
          {!recovery && mode === 'login' && <button className="text-button" type="button" onClick={() => void resetPassword()}>Esqueci minha senha</button>}
          <div className="divider" />
          <div className="session-row"><div><span className="label-muted">SESSÃO</span><p>{authenticated ? 'Autenticado nesta sessão' : 'Não autenticado'}</p></div><button className="button secondary" type="button" onClick={() => void logout()} disabled={!authenticated}>Sair</button></div>
        </article>

        <article className="card profile-card">
          <div className="section-heading"><div><p className="eyebrow">BACKEND API</p><h2>Meu perfil</h2></div><span className="step">02</span></div>
          <p className="card-copy">Os dados abaixo são carregados e salvos em <code>/api/v1/me/profile</code> com o token da sessão.</p>
          <form className="form" autoComplete="off" onSubmit={saveProfile}>
            <label>Nome de exibição<input id="profile-name" value={profile.displayName} onChange={(event) => setProfile({ ...profile, displayName: event.target.value })} name="display_name" type="text" maxLength={80} placeholder="Seu nome público" disabled={!authenticated} /></label>
            <label>URL do avatar<input id="profile-avatar" value={profile.avatarUrl} onChange={(event) => setProfile({ ...profile, avatarUrl: event.target.value })} name="avatar_url" type="url" maxLength={2048} placeholder="https://… ou vazio" disabled={!authenticated} /></label>
            <label>Bio<textarea id="profile-bio" value={profile.bio} onChange={(event) => setProfile({ ...profile, bio: event.target.value })} name="bio" maxLength={500} rows={4} placeholder="Conte um pouco sobre você" disabled={!authenticated} /><span className="field-hint">Até 500 caracteres</span></label>
            <div className="actions"><button id="load-profile" className="button secondary" type="button" onClick={() => void loadProfile()} disabled={!authenticated}>Carregar perfil</button><button id="save-profile" className="button primary" type="submit" disabled={!authenticated || profileBusy}>{profileBusy ? 'Salvando…' : 'Salvar alterações'}</button></div>
          </form>
        </article>
      </section>
      <footer><span>RPG · Backend validation</span><span>Sem chave secreta no navegador</span></footer>
    </main>
  );
}
