'use client';

import { BifrostLoading } from '../loading/bifrost-loading';

import type { FormEventHandler } from 'react';
import './profile-card.css';

export type ProfileFields = {
  username: string | null;
  displayName: string;
  avatarUrl: string;
  bannerUrl: string;
  bio: string;
  status: string;
  interests: string;
};

export type ProfileCardProps = {
  profile: ProfileFields;
  authenticated: boolean;
  profileBusy: boolean;
  previewing: boolean;
  onTogglePreview: () => void;
  onProfileChange: (field: keyof ProfileFields, value: string) => void;
  onLoadProfile: () => void;
  onSaveProfile: FormEventHandler<HTMLFormElement>;
};

export function ProfileCard({
  profile,
  authenticated,
  profileBusy,
  previewing,
  onTogglePreview,
  onProfileChange,
  onLoadProfile,
  onSaveProfile,
}: ProfileCardProps) {
  const interests = previewing ? profile.interests.split(',').map((interest) => interest.trim()).filter(Boolean).slice(0, 12) : [];
  return (
    <article className={`card profile-card${previewing ? ' profile-card-previewing' : ''}`}>
      <div className="section-heading">
        <div><p className="eyebrow">PERFIL DO JOGADOR</p><h2>{previewing ? 'Prévia pública' : 'Meu perfil'}</h2></div>
        <button className="button secondary profile-preview-toggle" type="button" onClick={onTogglePreview} aria-pressed={previewing}>
          {previewing ? 'Voltar à edição' : 'Visualizar como visitante'}
        </button>
      </div>
      {previewing ? <section className="profile-visitor-preview" aria-label="Prévia do perfil visível para outros jogadores">
        <div className="profile-visitor-cover" aria-hidden="true">{profile.bannerUrl && <img src={profile.bannerUrl} alt="" />}<span>BIFROST RPG</span></div>
        <div className="profile-visitor-identity">
          <div className="profile-visitor-avatar">
            {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : <span>{(profile.displayName || profile.username || 'J').charAt(0).toUpperCase()}</span>}
          </div>
          <div><h3>{profile.displayName || 'Aventureiro'}</h3><p>{profile.username ? `@${profile.username}` : 'Nick ainda não escolhido'}</p></div>
          <span className="profile-visitor-badge">JOGADOR</span>
        </div>
        {profile.status.trim() && <blockquote className="profile-visitor-status">“{profile.status.trim()}”</blockquote>}
        <div className="profile-visitor-bio"><h4>Sobre mim</h4><p>{profile.bio.trim() || 'Este jogador ainda não escreveu uma apresentação.'}</p></div>
        <div className="profile-visitor-interests"><h4>Interesses</h4>
          {interests.length > 0
            ? interests.map((interest) => <span key={interest}>{interest}</span>)
            : <p>Nenhum interesse adicionado.</p>}
        </div>
        <p className="profile-visitor-note">É assim que seu perfil aparece para outros jogadores. Dados de conta, como e-mail e telefone, não são exibidos.</p>
      </section> : <>
      <p className="card-copy">Atualize seu nome, avatar e uma breve apresentação.</p>
      <form className="form" autoComplete="off" onSubmit={onSaveProfile}>
        <label>Nick<output id="profile-username">{profile.username ? `@${profile.username}` : 'Ainda não escolhido'}</output><span className="field-hint">Depois de escolher, você poderá trocar seu @ uma única vez.</span></label>
        <label>Nome de exibição<input id="profile-name" value={profile.displayName} onChange={(event) => onProfileChange('displayName', event.target.value)} name="display_name" type="text" maxLength={80} placeholder="Seu nome público" disabled={!authenticated} /></label>
        <label>URL do avatar<input id="profile-avatar" value={profile.avatarUrl} onChange={(event) => onProfileChange('avatarUrl', event.target.value)} name="avatar_url" type="url" maxLength={2048} placeholder="https://… ou vazio" disabled={!authenticated} /></label>
        <label>URL do banner<input id="profile-banner" value={profile.bannerUrl} onChange={(event) => onProfileChange('bannerUrl', event.target.value)} name="banner_url" type="url" maxLength={2048} placeholder="Imagem de capa pública (opcional)" disabled={!authenticated} /></label>
        <label>Frase de status<input id="profile-status" value={profile.status} onChange={(event) => onProfileChange('status', event.target.value)} name="status" type="text" maxLength={120} placeholder="Uma frase para seu perfil" disabled={!authenticated} /><span className="field-hint">Até 120 caracteres</span></label>
        <label>Bio<textarea id="profile-bio" value={profile.bio} onChange={(event) => onProfileChange('bio', event.target.value)} name="bio" maxLength={500} rows={4} placeholder="Conte um pouco sobre você" disabled={!authenticated} /><span className="field-hint">Até 500 caracteres</span></label>
        <label>Interesses<input id="profile-interests" value={profile.interests} onChange={(event) => onProfileChange('interests', event.target.value)} name="interests" type="text" placeholder="RPG de mesa, fantasia, jogos…" disabled={!authenticated} /><span className="field-hint">Separe por vírgulas; até 12 itens com 40 caracteres cada.</span></label>
        <div className="actions"><button id="load-profile" className="button secondary" type="button" onClick={onLoadProfile} disabled={!authenticated}>Carregar perfil</button><button id="save-profile" className="button primary" type="submit" disabled={!authenticated || profileBusy}>{profileBusy ? <BifrostLoading variant="inline" label="Salvando…" /> : 'Salvar alterações'}</button></div>
      </form>
      </>}
    </article>
  );
}
