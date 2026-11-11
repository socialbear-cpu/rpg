'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CharacterHomePage } from '../../../../../src/features/characters/character-home-page';
import { hasSession } from '../../../../../src/supabase-auth';

export default function SystemCharacterHomePage() {
  const router = useRouter();
  const params = useParams<{ systemId: string; characterId: string }>();
  const [authenticated, setAuthenticated] = useState(false);
  useEffect(() => { if (hasSession()) setAuthenticated(true); else router.replace('/'); }, [router]);
  if (!authenticated) return null;
  return <CharacterHomePage systemId={params.systemId} characterId={params.characterId} push={(path) => router.push(path)} />;
}
