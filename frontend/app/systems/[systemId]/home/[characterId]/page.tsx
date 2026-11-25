'use client';

import { BifrostLoading } from '../../../../../src/features/loading/bifrost-loading';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { CharacterHomePage } from '../../../../../src/features/characters/character-home-page';
import { hasSession } from '../../../../../src/supabase-auth';

export default function SystemCharacterHomePage() {
  return <Suspense fallback={<BifrostLoading variant="screen" label="Carregando página…" />}><SystemCharacterHomeContent /></Suspense>;
}

function SystemCharacterHomeContent() {
  const router = useRouter();
  const params = useParams<{ systemId: string; characterId: string }>();
  const searchParams = useSearchParams();
  const [authenticated, setAuthenticated] = useState(false);
  useEffect(() => { if (hasSession()) setAuthenticated(true); else router.replace('/'); }, [router]);
  if (!authenticated) return <BifrostLoading variant="screen" label="Verificando sessão…" />;
  return <CharacterHomePage systemId={params.systemId} characterId={params.characterId} preferredChatId={searchParams.get('chatId')} push={(path) => router.push(path)} />;
}
