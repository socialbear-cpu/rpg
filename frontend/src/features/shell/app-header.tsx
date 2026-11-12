'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getMyProfile, type CharacterExperienceSummary, type CharacterSheetField, type Profile, type SystemCharacter } from '../../api';
import { formatCharacterSheetValue } from '../character-sheet/format-value';
import { signOut } from '../../supabase-auth';
import './app-header.css';

interface CharacterSheetPreview {
  systemName: string;
  character: SystemCharacter;
  fields: CharacterSheetField[];
  experience: CharacterExperienceSummary | null;
}

interface AppHeaderProps {
  activeItem?: string;
  backHref?: string;
  backLabel?: string;
  onLogout?: () => void;
  characterSheet?: CharacterSheetPreview | null;
  children?: ReactNode;
}

const navItems = [
  { label: 'Meus Sistemas', href: '/dashboard' },
  { label: 'Trocas', href: '/trading' },
  { label: 'Criar sistema', href: '/dashboard/systems/new' },
];

export function AppHeader({ activeItem = 'Meus Sistemas', backHref, backLabel = 'Voltar', onLogout, characterSheet, children }: AppHeaderProps) {
  const router = useRouter();
  const profileMenu = useRef<HTMLDetailsElement>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyProfile().then((result) => {
      if (cancelled) return;
      setProfile(result);
      if (!result.username) router.replace('/dashboard');
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    function closeMenu(event: MouseEvent | KeyboardEvent) {
      const menu = profileMenu.current;
      if (!menu?.open) return;
      if (event instanceof KeyboardEvent && event.key === 'Escape') {
        menu.open = false;
        menu.querySelector('summary')?.blur();
      }
      if (event instanceof MouseEvent && event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
    }
    document.addEventListener('pointerdown', closeMenu);
    document.addEventListener('keydown', closeMenu);
    return () => {
      document.removeEventListener('pointerdown', closeMenu);
      document.removeEventListener('keydown', closeMenu);
    };
  }, []);

  async function logout() {
    if (onLogout) {
      onLogout();
      return;
    }
    await signOut();
    router.replace('/');
  }

  const profileName = profile?.username ? `@${profile.username}` : profile?.display_name || 'Jogador';
  const avatarInitial = (profile?.username || profileName).charAt(0).toUpperCase();
  const requiredXp = characterSheet?.experience
    ? characterSheet.experience.xp_in_level + characterSheet.experience.xp_to_next_level
    : null;
  const xpProgress = requiredXp && characterSheet?.experience
    ? Math.min(100, characterSheet.experience.xp_in_level / requiredXp * 100)
    : 0;

  return (
    <header className="app-header">
      <div className="app-header-leading">
        <Link className="app-header-brand" href="/dashboard" aria-label="Nexus RPG início">
          <span className="app-header-mark" aria-hidden="true">✧</span>
          <span>NEXUS <em>RPG</em></span>
        </Link>
      </div>
      <nav className="app-header-nav" aria-label="Navegação principal">
        {navItems.map((item) => <Link key={item.label} className={`app-header-nav-link ${activeItem === item.label ? 'active' : ''}`} href={item.href} aria-current={activeItem === item.label ? 'page' : undefined}>{item.label}</Link>)}
      </nav>
      <details className="app-header-mobile-menu">
        <summary aria-label="Abrir navegação">☰</summary>
        <nav aria-label="Navegação principal">
          {navItems.map((item) => <Link key={item.label} className={activeItem === item.label ? 'active' : ''} href={item.href} aria-current={activeItem === item.label ? 'page' : undefined}>{item.label}</Link>)}
        </nav>
      </details>
      <div className="app-header-actions">
        {backHref && <Link className="app-header-back" href={backHref}>← {backLabel}</Link>}
        {children}
        <details className="app-header-profile" ref={profileMenu}>
          <summary className="app-header-profile-trigger" aria-label="Abrir perfil do jogador" title="Perfil do jogador">
            {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : <span>{avatarInitial}</span>}
          </summary>
          <section className="app-header-profile-popover" aria-label="Perfil e ficha do personagem">
            <div className="app-header-profile-identity">
              <div className="app-header-profile-avatar">{profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : avatarInitial}</div>
              <div><strong>{profileName}</strong><span>Aventureiro Nexus</span></div>
            </div>
            <nav className="app-header-profile-options" aria-label="Opções do perfil">
              <Link href="/profile">Meu perfil <span aria-hidden="true">↗</span></Link>
              <button type="button" disabled>Configurações <small>Em breve</small></button>
              <button type="button" className="app-header-logout" onClick={() => void logout()}>Sair da conta</button>
            </nav>
            <section className="app-header-character-sheet" aria-label="Ficha completa do personagem">
              <div className="app-header-sheet-heading"><span>SUA FICHA</span><span>{characterSheet?.systemName ?? 'PERSONAGEM ATUAL'}</span></div>
              {characterSheet ? <>
                <h2>{characterSheet.character.character_name}</h2>
                <div className="app-header-sheet-level">Nível {characterSheet.experience?.level ?? '—'}</div>
                <div className="app-header-sheet-xp">
                  <div><span>Experiência</span><strong>{characterSheet.experience ? `${characterSheet.experience.total_xp} XP` : '—'}</strong></div>
                  <div className="app-header-sheet-xp-track" role="progressbar" aria-label="Progresso para o próximo nível" aria-valuenow={Math.round(xpProgress)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${xpProgress}%` }} /></div>
                  <div className="app-header-sheet-xp-caption"><span>{characterSheet.experience && requiredXp !== null ? `${characterSheet.experience.xp_in_level} / ${requiredXp} XP` : 'Progresso indisponível'}</span>{characterSheet.experience && <span>Faltam {characterSheet.experience.xp_to_next_level} XP</span>}</div>
                </div>
                <dl className="app-header-sheet-fields">{characterSheet.fields.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{formatCharacterSheetValue(field, characterSheet.character.attributes[field.key])}</dd></div>)}</dl>
              </> : <p className="app-header-sheet-empty">Selecione um personagem para ver a ficha completa aqui.</p>}
            </section>
          </section>
        </details>
      </div>
    </header>
  );
}
