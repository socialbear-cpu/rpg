'use client';

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getMyProfile, type Profile } from '../../api';
import { signOut } from '../../supabase-auth';
import { BifrostBrand } from './bifrost-brand';
import { CharacterMenu, type CharacterSheetPreview } from './character-menu';
import { NotificationCenter } from '../notifications/notification-center';
import { MessagesPopup } from '../messages/messages-popup';
import './app-header.css';

interface AppHeaderProps {
  activeItem?: string;
  backHref?: string;
  backLabel?: string;
  onLogout?: () => void;
  characterSheet?: CharacterSheetPreview | null;
  onOpenCharacterSheet?: () => void;
  onSwitchCharacter?: () => void;
  children?: ReactNode;
}

const socialItems = [
  { label: 'Amigos', href: '/friends' },
  { label: 'Trocas', href: '/trading' },
];

export function AppHeader({ activeItem = 'Meus Sistemas', backHref, backLabel = 'Voltar', onLogout, characterSheet, onOpenCharacterSheet, onSwitchCharacter, children }: AppHeaderProps) {
  const router = useRouter();
  const profileMenu = useRef<HTMLDetailsElement>(null);
  const navigationMenu = useRef<HTMLDetailsElement>(null);
  const socialMenu = useRef<HTMLDetailsElement>(null);
  const characterMenu = useRef<HTMLDetailsElement>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [messagesInitialized, setMessagesInitialized] = useState(false);

  function openMessages(event: ReactMouseEvent<HTMLButtonElement>) {
    const menu = event.currentTarget.closest('details');
    // The menu item becomes hidden; restore focus to its visible summary on close.
    menu?.querySelector('summary')?.focus();
    if (menu) menu.open = false;
    setMessagesInitialized(true);
    setMessagesOpen(true);
  }

  useEffect(() => {
    let cancelled = false;
    getMyProfile().then(result => {
      if (cancelled) return;
      setProfile(result);
      if (!result.username) router.replace('/dashboard');
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    function closeMenu(event: MouseEvent | KeyboardEvent) {
      const openMenus = [profileMenu.current, navigationMenu.current, socialMenu.current, characterMenu.current]
        .filter((menu): menu is HTMLDetailsElement => Boolean(menu?.open));
      if (event instanceof KeyboardEvent && event.key === 'Escape') {
        const activeMenu = openMenus.find(menu => menu.contains(document.activeElement)) ?? openMenus[openMenus.length - 1];
        for (const menu of openMenus) menu.open = false;
        activeMenu?.querySelector('summary')?.focus();
        return;
      }
      for (const menu of openMenus) {
        if (event instanceof MouseEvent && event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
      }
    }
    document.addEventListener('pointerdown', closeMenu);
    document.addEventListener('keydown', closeMenu);
    return () => {
      document.removeEventListener('pointerdown', closeMenu);
      document.removeEventListener('keydown', closeMenu);
    };
  }, []);

  async function logout() {
    if (onLogout) { onLogout(); return; }
    await signOut();
    router.replace('/');
  }

  const profileName = profile?.username ? `@${profile.username}` : profile?.display_name || 'Jogador';
  const avatarInitial = (profile?.username || profileName).charAt(0).toUpperCase();
  const normalizedActiveItem = activeItem.trim().toUpperCase();
  const socialActive = messagesOpen || socialItems.some(item => item.label.toUpperCase() === normalizedActiveItem);
  const playActive = normalizedActiveItem === 'MEUS SISTEMAS' || normalizedActiveItem === 'CRIAR SISTEMA';

  return (
    <><header className="app-header">
      <div className="app-header-leading">
        <Link className="app-header-brand" href="/dashboard" aria-label="Bifrost RPG início"><BifrostBrand /></Link>
      </div>
      <nav className="app-header-nav" aria-label="Navegação principal">
        <Link className="app-header-nav-link bifrost-tab" href="/dashboard" aria-current={playActive ? 'page' : undefined}>Jogar</Link>
        <details className="app-header-social" ref={socialMenu}>
          <summary className="app-header-nav-link bifrost-tab" data-active={socialActive || undefined}>Social <span aria-hidden="true">⌄</span></summary>
          <nav className="app-header-social-popover" aria-label="Social" onClick={() => { if (socialMenu.current) socialMenu.current.open = false; }}>
            <button type="button" className="app-header-social-link" aria-haspopup="dialog" aria-expanded={messagesOpen} onClick={openMessages}>Mensagens</button>
            {socialItems.map(item => <Link key={item.href} className="app-header-social-link" href={item.href} aria-current={normalizedActiveItem === item.label.toUpperCase() ? 'page' : undefined}>{item.label}</Link>)}
          </nav>
        </details>
      </nav>
      <details className="app-header-mobile-menu" ref={navigationMenu}>
        <summary aria-label="Abrir navegação"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M5 6h14M5 12h14M5 18h14" /></svg></summary>
        <nav aria-label="Navegação principal" onClick={() => { if (navigationMenu.current) navigationMenu.current.open = false; }}>
          <Link className="bifrost-tab" href="/dashboard" aria-current={playActive ? 'page' : undefined}>Jogar</Link>
          <span className="app-header-mobile-label">Social</span>
          <button type="button" className="bifrost-tab" aria-haspopup="dialog" aria-expanded={messagesOpen} onClick={openMessages}>Mensagens</button>
          {socialItems.map(item => <Link key={item.href} className="bifrost-tab" href={item.href} aria-current={normalizedActiveItem === item.label.toUpperCase() ? 'page' : undefined}>{item.label}</Link>)}
        </nav>
      </details>
      <div className="app-header-actions">
        <NotificationCenter compact />
        <details className="app-header-profile" ref={profileMenu}>
          <summary className="app-header-profile-trigger" aria-label="Abrir conta" title="Conta">
            <span className="app-header-account-avatar">{profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : avatarInitial}</span>
            <span className="app-header-account-label">Conta</span>
          </summary>
          <section className="app-header-profile-popover" aria-label="Conta">
            <div className="app-header-profile-identity">
              <div className="app-header-profile-avatar">{profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : avatarInitial}</div>
              <div><strong>{profileName}</strong><span>Conta Bifrost</span></div>
            </div>
            <nav className="app-header-profile-options" aria-label="Opções da conta">
              <Link href="/profile">Meu perfil <span aria-hidden="true">↗</span></Link>
              <Link href="/account-settings">Configurações <span aria-hidden="true">↗</span></Link>
              <button type="button" className="app-header-logout" onClick={() => void logout()}>Sair da conta</button>
            </nav>
          </section>
        </details>
      </div>
      {(backHref || children || characterSheet) && <div className="app-header-context">
        {backHref && <Link className="app-header-back" href={backHref}>← {backLabel}</Link>}
        {characterSheet && <CharacterMenu preview={characterSheet} menuRef={characterMenu} onOpenSheet={onOpenCharacterSheet} onSwitch={onSwitchCharacter} />}
        {children && <div className="app-header-context-actions">{children}</div>}
      </div>}
    </header>
    {messagesInitialized && <MessagesPopup open={messagesOpen} onClose={() => setMessagesOpen(false)} />}
    </>
  );
}
