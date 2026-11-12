'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AccountCard, type AccountMode } from '../src/features/account/account-card';
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
import './account-page.css';

type Notice = { message: string; error: boolean } | null;

export function RpgApp() {
  const router = useRouter();
  const [mode, setMode] = useState<AccountMode>('login');
  const [notice, setNotice] = useState<Notice>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);

  useEffect(() => {
    const missing = missingSupabaseConfig();
    if (missing.length) setNotice({ message: `Configure as variáveis NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY para habilitar cadastro e login. (${missing.join(' e ')})`, error: true });

    const callback = consumeAuthCallback();
    if (callback.recovery) setRecovery(true);
    else if (callback.error) setNotice({ message: `${callback.error} Informe seu e-mail e solicite outro link.`, error: true });
    const sessionExists = hasSession();
    setAuthenticated(sessionExists);
    if (sessionExists && !callback.recovery) router.replace('/dashboard');
  }, [router]);

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
        if (result.access_token) {
          router.push('/dashboard');
        } else {
          showNotice('Cadastro recebido. Confirme seu e-mail para poder entrar.');
        }
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

  if (authenticated && !recovery) return <main className="shell"><p role="status">Abrindo seus sistemas…</p></main>;

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
            <p>Crie sistemas, personalize fichas e reúna seu grupo para escrever histórias que só poderiam acontecer na seu sistema.</p>
          </div>
          <div className="auth-story-rune" aria-hidden="true"><span>✧</span><i /><b /></div>
          <div className="auth-story-footer"><span className="auth-live-dot" /> Um espaço para quem joga e cria RPG</div>
        </section>
        <section className="auth-form-panel" aria-label={recovery ? 'Recuperar acesso' : mode === 'signup' ? 'Criar conta' : 'Entrar'}>
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
