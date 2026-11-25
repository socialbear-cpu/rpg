'use client';

import { BifrostLoading } from '../loading/bifrost-loading';

import type { FormEventHandler, KeyboardEvent } from 'react';

export type AccountMode = 'login' | 'signup';

export type AccountCardProps = {
  mode: AccountMode;
  recovery: boolean;
  authenticated: boolean;
  email: string;
  password: string;
  displayName: string;
  newPassword: string;
  authBusy: boolean;
  recoveryBusy: boolean;
  onModeChange: (mode: AccountMode) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onDisplayNameChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onSubmitAuth: FormEventHandler<HTMLFormElement>;
  onSubmitRecovery: FormEventHandler<HTMLFormElement>;
  onResetPassword: () => void;
  onLogout: () => void;
};

export function AccountCard({
  mode,
  recovery,
  authenticated,
  email,
  password,
  displayName,
  newPassword,
  authBusy,
  recoveryBusy,
  onModeChange,
  onEmailChange,
  onPasswordChange,
  onDisplayNameChange,
  onNewPasswordChange,
  onSubmitAuth,
  onSubmitRecovery,
  onResetPassword,
  onLogout,
}: AccountCardProps) {
  function handleTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    let nextMode: AccountMode;
    if (event.key === 'Home') nextMode = 'login';
    else if (event.key === 'End') nextMode = 'signup';
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') nextMode = mode === 'login' ? 'signup' : 'login';
    else return;

    event.preventDefault();
    onModeChange(nextMode);
    event.currentTarget.querySelector<HTMLButtonElement>(`#tab-${nextMode}`)?.focus();
  }

  return (
    <article className="card auth-card">
      <div className="section-heading account-card-heading"><div><p className="eyebrow">{recovery ? 'RECUPERAÇÃO DE ACESSO' : mode === 'signup' ? 'COMECE SUA JORNADA' : 'BEM-VINDO DE VOLTA'}</p><h2>{recovery ? 'Nova senha' : mode === 'signup' ? 'Comece sua aventura' : 'A mesa está pronta.'}</h2><p className="account-card-description">{recovery ? 'Escolha uma nova senha para sua conta.' : mode === 'signup' ? 'Crie personagens, reúna seu grupo e dê vida às suas histórias.' : 'Suas fichas, seus personagens e seus sistemas de RPG em um só lugar.'}</p></div>{authenticated && <span className="step">01</span>}</div>
      {!recovery && <div className="tabs bifrost-tab-list--segment" role="tablist" aria-label="Acesso à conta" onKeyDown={handleTabKeyDown}>
        <button className="tab bifrost-tab" id="tab-login" type="button" role="tab" aria-selected={mode === 'login'} aria-controls="panel-auth" tabIndex={mode === 'login' ? 0 : -1} onClick={() => onModeChange('login')}>Entrar</button>
        <button className="tab bifrost-tab" id="tab-signup" type="button" role="tab" aria-selected={mode === 'signup'} aria-controls="panel-auth" tabIndex={mode === 'signup' ? 0 : -1} onClick={() => onModeChange('signup')}>Criar conta</button>
      </div>}
      <div id="panel-auth" role={recovery ? undefined : 'tabpanel'} aria-labelledby={recovery ? undefined : `tab-${mode}`} tabIndex={recovery ? undefined : 0}>
        {recovery ? <form className="form" autoComplete="off" aria-busy={recoveryBusy} onSubmit={onSubmitRecovery}>
          <p className="card-copy">Defina uma nova senha para concluir a recuperação da conta.</p>
          <label>Nova senha<input value={newPassword} onChange={(event) => onNewPasswordChange(event.target.value)} type="password" minLength={6} autoComplete="new-password" required placeholder="Mínimo de 6 caracteres" /></label>
          <button className="button primary" type="submit" disabled={recoveryBusy}>{recoveryBusy ? <BifrostLoading variant="inline" label="Atualizando…" /> : 'Atualizar senha'}</button>
        </form> : <form className="form" autoComplete="on" aria-busy={authBusy} onSubmit={onSubmitAuth}>
          {mode === 'signup' && <label>Nome de exibição<input value={displayName} onChange={(event) => onDisplayNameChange(event.target.value)} type="text" maxLength={80} autoComplete="nickname" placeholder="Como devemos chamar você?" required /></label>}
          <label>E-mail<input value={email} onChange={(event) => onEmailChange(event.target.value)} type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required placeholder="voce@exemplo.com" /></label>
          <label>Senha<input value={password} onChange={(event) => onPasswordChange(event.target.value)} type="password" minLength={6} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required placeholder="Mínimo de 6 caracteres" /></label>
          <button className="button primary" type="submit" disabled={authBusy}>{authBusy ? (mode === 'signup' ? <BifrostLoading variant="inline" label="Criando…" /> : <BifrostLoading variant="inline" label="Entrando…" />) : mode === 'signup' ? 'Criar conta' : 'Entrar'}</button>
        </form>}
      </div>
      {!recovery && mode === 'login' && <button className="text-button" type="button" onClick={onResetPassword}>Esqueci minha senha</button>}
      <div className="divider" />
      <div className="session-row"><div><span className="label-muted">SESSÃO</span><p>{authenticated ? 'Autenticado nesta sessão' : 'Não autenticado'}</p></div><button className="button secondary" type="button" onClick={onLogout} disabled={!authenticated}>Sair</button></div>
    </article>
  );
}
