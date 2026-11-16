import { PublicProfilePage } from '../../../src/features/profile/public-profile-page';

export default async function PlayerRoute({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <PublicProfilePage username={username} />;
}
