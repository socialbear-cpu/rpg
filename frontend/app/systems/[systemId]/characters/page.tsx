'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { CharacterEntry } from '../../../../src/features/characters/character-entry';
import { hasSession } from '../../../../src/supabase-auth';

export default function SystemCharactersPage() {
  return <Suspense fallback={null}><SystemCharactersContent /></Suspense>;
}

function SystemCharactersContent() {
  const router = useRouter();
  const params = useParams<{ systemId: string }>();
  const searchParams = useSearchParams();
  const [authenticated, setAuthenticated] = useState(false);
  useEffect(() => { if (hasSession()) setAuthenticated(true); else router.replace('/'); }, [router]);
  if (!authenticated) return null;
  return <CharacterEntry systemId={params.systemId} invitationId={searchParams.get('invitationId')} invitationChatId={searchParams.get('chatId')} push={(path) => router.push(path)} />;
}
