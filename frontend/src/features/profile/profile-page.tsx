'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getMyProfile, updateMyProfile, type Profile, type ProfilePatch } from '../../api';
import { hasSession } from '../../supabase-auth';
import { AppHeader } from '../shell/app-header';
import { ProfileCard, type ProfileFields } from './profile-card';
import { PublicProfilePage } from './public-profile-page';

function profileFields(profile: Profile): ProfileFields {
  return {
    username: profile.username,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url ?? '',
    bannerUrl: profile.banner_url ?? '',
    bio: profile.bio ?? '',
    status: profile.status ?? '',
    interests: profile.interests.join(', '),
  };
}

export function ProfilePage() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [profile, setProfile] = useState<ProfileFields | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (!hasSession()) {
      router.replace('/');
      return;
    }
    setAuthenticated(true);
    let active = true;
    setLoading(true);
    setMessage(null);
    void getMyProfile().then((value) => {
      if (active) setProfile(profileFields(value));
    }).catch((error) => {
      if (active) {
        setMessage(error instanceof Error ? error.message : 'Não foi possível carregar seu perfil.');
        setMessageIsError(true);
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [router, reloadKey]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || saving || loading) return;
    setSaving(true);
    setMessage(null);
    try {
      const patch: ProfilePatch = {
        display_name: profile.displayName,
        avatar_url: profile.avatarUrl.trim() || null,
        banner_url: profile.bannerUrl.trim() || null,
        bio: profile.bio || null,
        status: profile.status.trim() || null,
        interests: profile.interests.split(',').map((interest) => interest.trim()).filter(Boolean),
      };
      const updated = await updateMyProfile(patch);
      setProfile(profileFields(updated));
      setMessage('Perfil atualizado.');
      setMessageIsError(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar seu perfil.');
      setMessageIsError(true);
    } finally { setSaving(false); }
  }

  if (!authenticated) return null;
  if (profile?.username) return <PublicProfilePage key={profile.username} username={profile.username} isOwnProfile onUsernameChanged={(username) => setProfile((current) => current ? { ...current, username } : current)} />;
  return <main className="shell">
    <AppHeader activeItem="" backHref="/dashboard" backLabel="Voltar aos sistemas" />
    <section className="intro"><p className="eyebrow">SUA CONTA</p><h1>Meu perfil</h1><p>Personalize como você aparece para os outros jogadores.</p></section>
    {message && <p className={`notice${messageIsError ? ' error' : ''}`} role="status">{message}</p>}
    {loading ? <p role="status">Carregando perfil…</p> : profile ? <ProfileCard
      profile={profile} authenticated profileBusy={saving}
      previewing={previewing} onTogglePreview={() => setPreviewing((value) => !value)}
      onProfileChange={(field, value) => setProfile((current) => current ? { ...current, [field]: value } : current)}
      onLoadProfile={() => setReloadKey((key) => key + 1)}
      onSaveProfile={(event) => { void saveProfile(event); }}
    /> : <button className="button secondary" type="button" onClick={() => setReloadKey((key) => key + 1)}>Tentar novamente</button>}
  </main>;
}
