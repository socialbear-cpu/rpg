'use client';

import type { FormEventHandler } from 'react';

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
  return (
    <article className="card auth-card">
      <div className="section-heading"><div><p className="eyebrow">CONTA</p><h2>Acessar</h2></div><span className="step">01</span></div>
      {!recovery && <div className="tabs" role="tablist" aria-label="Acesso à conta">
        <button className={`tab${mode === 'login' ? ' active' : ''}`} id="tab-login" type="button" role="tab" aria-selected={mode === 'login'} aria-controls="panel-auth" onClick={() => onModeChange('login')}>Entrar</button>
        <button className={`tab${mode === 'signup' ? ' active' : ''}`} id="tab-signup" type="button" role="tab" aria-selected={mode === 'signup'} aria-controls="panel-auth" onClick={() => onModeChange('signup')}>Criar conta</button>
      </div>}
      <div id="panel-auth">
        {recovery ? <form className="form" autoComplete="off" onSubmit={onSubmitRecovery}>
          <p className="card-copy">Defina uma nova senha para concluir a recuperação da conta.</p>
          <label>Nova senha<input value={newPassword} onChange={(event) => onNewPasswordChange(event.target.value)} type="password" minLength={6} autoComplete="new-password" required placeholder="Mínimo de 6 caracteres" /></label>
          <button className="button primary" type="submit" disabled={recoveryBusy}>{recoveryBusy ? 'Atualizando…' : 'Atualizar senha'}</button>
        </form> : <form className="form" autoComplete="on" onSubmit={onSubmitAuth}>
          {mode === 'signup' && <label>Nome de exibição<input value={displayName} onChange={(event) => onDisplayNameChange(event.target.value)} type="text" maxLength={80} autoComplete="nickname" placeholder="Como devemos chamar você?" required /></label>}
          <label>E-mail<input value={email} onChange={(event) => onEmailChange(event.target.value)} type="email" autoComplete="email" required placeholder="voce@exemplo.com" /></label>
          <label>Senha<input value={password} onChange={(event) => onPasswordChange(event.target.value)} type="password" minLength={6} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required placeholder="Mínimo de 6 caracteres" /></label>
          <button className="button primary" type="submit" disabled={authBusy}>{authBusy ? (mode === 'signup' ? 'Criando…' : 'Entrando…') : mode === 'signup' ? 'Criar conta' : 'Entrar'}</button>
        </form>}
      </div>
      {!recovery && mode === 'login' && <button className="text-button" type="button" onClick={onResetPassword}>Esqueci minha senha</button>}
      <div className="divider" />
      <div className="session-row"><div><span className="label-muted">SESSÃO</span><p>{authenticated ? 'Autenticado nesta sessão' : 'Não autenticado'}</p></div><button className="button secondary" type="button" onClick={onLogout} disabled={!authenticated}>Sair</button></div>
    </article>
  );
}
