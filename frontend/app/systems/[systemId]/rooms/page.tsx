'use client';
import { useParams } from 'next/navigation';
import { SystemRoomsPage } from '../../../../src/features/chats/system-rooms-page';
export default function Page() {
  const { systemId } = useParams<{ systemId: string }>();
  return <SystemRoomsPage key={systemId} systemId={systemId} />;
}
