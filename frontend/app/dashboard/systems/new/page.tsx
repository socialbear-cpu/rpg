'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SystemCreationWizard } from '../../../../src/features/system-creation/system-creation-wizard';
import { createGameSystem } from '../../../../src/api';
import { hasSession } from '../../../../src/supabase-auth';

export default function NewSystemPage() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    if (hasSession()) setAuthenticated(true);
    else router.replace('/');
  }, [router]);

  if (!authenticated) return null;
  return <SystemCreationWizard createSystem={createGameSystem} push={(path) => router.push(path)} />;
}
