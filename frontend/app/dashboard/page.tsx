'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dashboard } from '../../src/features/dashboard/dashboard';
import { hasSession, signOut } from '../../src/supabase-auth';

export default function DashboardPage() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    if (hasSession()) setAuthenticated(true);
    else router.replace('/');
  }, [router]);

  async function logout() {
    try {
      await signOut();
    } finally {
      router.replace('/');
    }
  }

  if (!authenticated) return null;

  return <Dashboard playerName="" onLogout={() => void logout()} />;
}
