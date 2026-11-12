'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dashboard } from '../../src/features/dashboard/dashboard';
import { UsernameSetup } from '../../src/features/profile/username-setup';
import { getMyProfile, updateMyProfile, type Profile } from '../../src/api';
import { hasSession, signOut } from '../../src/supabase-auth';

export default function DashboardPage() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    setProfileError(null);
    try {
      setProfile(await getMyProfile());
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Não foi possível carregar seu perfil.');
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasSession()) setAuthenticated(true);
    else {
      setProfileLoading(false);
      router.replace('/');
      return;
    }
    void loadProfile();
  }, [loadProfile, router]);

  async function logout() {
    try {
      await signOut();
    } finally {
      router.replace('/');
    }
  }

  async function chooseUsername(username: string) {
    setProfile(await updateMyProfile({ username }));
  }

  if (!authenticated || profileLoading) return null;
  if (profileError) {
    return (
      <main className="username-setup-page">
        <section className="username-setup-card">
          <h1>Não foi possível carregar seu perfil</h1>
          <p className="username-setup-error" role="alert">{profileError}</p>
          <button type="button" onClick={() => void loadProfile()}>Tentar novamente</button>
        </section>
      </main>
    );
  }
  if (!profile) return null;
  if (!profile.username) return <UsernameSetup onSubmit={chooseUsername} />;

  return <Dashboard playerName={`@${profile.username}`} onLogout={() => void logout()} />;
}
