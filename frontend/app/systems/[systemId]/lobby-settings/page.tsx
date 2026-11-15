'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { LobbySettingsPage } from '../../../../src/features/characters/lobby-settings-page';
import { hasSession } from '../../../../src/supabase-auth';

export default function SystemLobbySettingsRoute() {
  const router = useRouter();
  const params = useParams<{ systemId: string }>();
  const [authenticated, setAuthenticated] = useState(false);
  useEffect(() => { if (hasSession()) setAuthenticated(true); else router.replace('/'); }, [router]);
  if (!authenticated) return null;
  return <LobbySettingsPage systemId={params.systemId} />;
}
