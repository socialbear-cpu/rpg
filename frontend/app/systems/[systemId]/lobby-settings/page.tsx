'use client';

import { BifrostLoading } from '../../../../src/features/loading/bifrost-loading';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { LobbySettingsPage } from '../../../../src/features/characters/lobby-settings-page';
import { hasSession } from '../../../../src/supabase-auth';

export default function SystemLobbySettingsRoute() {
  const router = useRouter();
  const params = useParams<{ systemId: string }>();
  const [authenticated, setAuthenticated] = useState(false);
  useEffect(() => { if (hasSession()) setAuthenticated(true); else router.replace('/'); }, [router]);
  if (!authenticated) return <BifrostLoading variant="screen" label="Verificando sessão…" />;
  return <LobbySettingsPage systemId={params.systemId} />;
}
