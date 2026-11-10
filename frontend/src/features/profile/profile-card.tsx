'use client';

import type { FormEventHandler } from 'react';

export type ProfileFields = {
  displayName: string;
  avatarUrl: string;
  bio: string;
};

export type ProfileCardProps = {
  profile: ProfileFields;
  authenticated: boolean;
  profileBusy: boolean;
  onProfileChange: (field: keyof ProfileFields, value: string) => void;
  onLoadProfile: () => void;
  onSaveProfile: FormEventHandler<HTMLFormElement>;
};

export function ProfileCard({
  profile,
  authenticated,
  profileBusy,
  onProfileChange,
  onLoadProfile,
  onSaveProfile,
}: ProfileCardProps) {
  return (
    <article className="card profile-card">
      <div className="section-heading"><div><p className="eyebrow">BACKEND API</p><h2>Meu perfil</h2></div><span className="step">02</span></div>
      <p className="card-copy">Os dados abaixo são carregados e salvos em <code>/api/v1/me/profile</code> com o token da sessão.</p>
      <form className="form" autoComplete="off" onSubmit={onSaveProfile}>
        <label>Nome de exibição<input id="profile-name" value={profile.displayName} onChange={(event) => onProfileChange('displayName', event.target.value)} name="display_name" type="text" maxLength={80} placeholder="Seu nome público" disabled={!authenticated} /></label>
        <label>URL do avatar<input id="profile-avatar" value={profile.avatarUrl} onChange={(event) => onProfileChange('avatarUrl', event.target.value)} name="avatar_url" type="url" maxLength={2048} placeholder="https://… ou vazio" disabled={!authenticated} /></label>
        <label>Bio<textarea id="profile-bio" value={profile.bio} onChange={(event) => onProfileChange('bio', event.target.value)} name="bio" maxLength={500} rows={4} placeholder="Conte um pouco sobre você" disabled={!authenticated} /><span className="field-hint">Até 500 caracteres</span></label>
        <div className="actions"><button id="load-profile" className="button secondary" type="button" onClick={onLoadProfile} disabled={!authenticated}>Carregar perfil</button><button id="save-profile" className="button primary" type="submit" disabled={!authenticated || profileBusy}>{profileBusy ? 'Salvando…' : 'Salvar alterações'}</button></div>
      </form>
    </article>
  );
}
