'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CharacterEntry } from '../../../../src/features/characters/character-entry';
import { hasSession } from '../../../../src/supabase-auth';

export default function SystemCharactersPage() {
  const router = useRouter();
  const params = useParams<{ systemId: string }>();
  const [authenticated, setAuthenticated] = useState(false);
  useEffect(() => { if (hasSession()) setAuthenticated(true); else router.replace('/'); }, [router]);
  if (!authenticated) return null;
  return <CharacterEntry systemId={params.systemId} push={(path) => router.push(path)} />;
}
