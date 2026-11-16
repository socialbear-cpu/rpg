'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getMyFriends, getSocialInvitations, removeMyFriend, respondToFriendRequest, respondToSocialInvitation, searchSocialProfiles, sendFriendRequest, type FriendshipList, type SocialInvitationList, type SocialProfile } from '../../api';
import { hasSession } from '../../supabase-auth';
import { AppHeader } from '../shell/app-header';
import './friends-page.css';

export function FriendsPage() {
  const router = useRouter();
  const [friends, setFriends] = useState<FriendshipList>({ friends: [], incoming_requests: [], outgoing_requests: [] });
  const [invitations, setInvitations] = useState<SocialInvitationList>({ owner_approvals: [], recipient_invitations: [] });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SocialProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [graph, inbox] = await Promise.all([getMyFriends(), getSocialInvitations()]);
      setFriends(graph); setInvitations(inbox);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a área de amigos.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (!hasSession()) { router.replace('/'); return; } void load(); }, [load, router]);
  async function search(event: FormEvent) {
    event.preventDefault(); setError(null); setNotice(null);
    try { setResults((await searchSocialProfiles(query)).results); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível buscar jogadores.'); }
  }
  async function act(key: string, operation: () => Promise<unknown>, message: string) {
    setBusy(key); setError(null);
    try { await operation(); setNotice(message); await load(); if (key.startsWith('friend:')) setResults((current) => current.filter((profile) => profile.user_id !== key.slice(7))); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível concluir a ação.'); }
    finally { setBusy(null); }
  }
  return <main className="friends-page"><AppHeader activeItem="Amigos" />
    <div className="friends-content"><header className="friends-heading"><span>REDE BIFROST</span><h1>Amigos</h1><p>Encontre jogadores, gerencie pedidos e acompanhe convites para suas aventuras.</p></header>
      {error && <p role="alert" className="friends-alert">{error}</p>}{notice && <p role="status" className="friends-notice">{notice}</p>}
      <section className="friends-panel"><h2>Encontrar jogadores</h2><form className="friends-search" onSubmit={(event) => void search(event)}><label htmlFor="friend-search">Buscar pelo nick</label><div><span aria-hidden="true">@</span><input id="friend-search" value={query} onChange={(event) => setQuery(event.target.value)} minLength={2} maxLength={20} pattern="[a-zA-Z0-9_]+" placeholder="nome_do_jogador" required /><button type="submit">Buscar</button></div></form>
        {results.length > 0 && <ul className="friends-list">{results.map((profile) => <li key={profile.user_id}><ProfileLine profile={profile} /><button disabled={busy === `friend:${profile.user_id}`} onClick={() => void act(`friend:${profile.user_id}`, () => sendFriendRequest(profile.user_id), `Pedido enviado para @${profile.username}.`)}>Adicionar</button></li>)}</ul>}
        {!loading && results.length === 0 && query.length >= 2 && <p className="friends-muted">Busque um nick para ver jogadores.</p>}
      </section>
      <section className="friends-grid">
        <section className="friends-panel"><h2>Meus amigos <small>{friends.friends.length}</small></h2>{loading ? <p role="status">Carregando…</p> : friends.friends.length ? <ul className="friends-list">{friends.friends.map((friend) => <li key={friend.user_id}><ProfileLine profile={friend} /><button className="friends-secondary" disabled={busy === friend.user_id} onClick={() => void act(friend.user_id, () => removeMyFriend(friend.user_id), `@${friend.username} removido da sua lista.`)}>Remover</button></li>)}</ul> : <p className="friends-muted">Sua lista ainda está vazia.</p>}</section>
        <section className="friends-panel"><h2>Pedidos de amizade</h2>{friends.incoming_requests.length === 0 && friends.outgoing_requests.length === 0 ? <p className="friends-muted">Nenhum pedido pendente.</p> : <ul className="friends-list">{friends.incoming_requests.map((item) => <li key={item.id}><ProfileLine profile={item} /><div><button disabled={Boolean(busy)} onClick={() => void act(item.id, () => respondToFriendRequest(item.id, 'accept'), 'Pedido aceito.')}>Aceitar</button><button className="friends-secondary" disabled={Boolean(busy)} onClick={() => void act(item.id, () => respondToFriendRequest(item.id, 'decline'), 'Pedido recusado.')}>Recusar</button></div></li>)}{friends.outgoing_requests.map((item) => <li key={item.id}><ProfileLine profile={item} /><button className="friends-secondary" disabled={Boolean(busy)} onClick={() => void act(item.id, () => respondToFriendRequest(item.id, 'cancel'), 'Pedido cancelado.')}>Cancelar</button></li>)}</ul>}</section>
        <section className="friends-panel"><h2>Aprovações como dono <small>{invitations.owner_approvals.length}</small></h2>{invitations.owner_approvals.length ? <ul className="friends-list">{invitations.owner_approvals.map((item) => <li key={item.id}><div><strong>@{item.username}</strong><span>{item.chat_name ? `Chat ${item.chat_name}` : item.system_name}</span></div><div><button disabled={Boolean(busy)} onClick={() => void act(item.id, () => respondToSocialInvitation(item.id, 'approve'), 'Convite aprovado e enviado.')}>Aprovar</button><button className="friends-secondary" disabled={Boolean(busy)} onClick={() => void act(item.id, () => respondToSocialInvitation(item.id, 'decline'), 'Solicitação recusada.')}>Recusar</button></div></li>)}</ul> : <p className="friends-muted">Nenhuma solicitação aguardando sua aprovação.</p>}</section>
        <section className="friends-panel"><h2>Convites para você <small>{invitations.recipient_invitations.length}</small></h2>{invitations.recipient_invitations.length ? <ul className="friends-list">{invitations.recipient_invitations.map((item) => <li key={item.id}><div><strong>@{item.username}</strong><span>{item.chat_name ? `Chat ${item.chat_name}` : item.system_name}</span></div><div>{item.status === 'accepted' && item.chat_id ? <button onClick={() => router.push(`/systems/${encodeURIComponent(item.game_system_id)}/characters?invitationId=${encodeURIComponent(item.id)}&chatId=${encodeURIComponent(item.chat_id!)}`)}>Continuar no chat</button> : <><button disabled={Boolean(busy)} onClick={() => void act(item.id, () => respondToSocialInvitation(item.id, 'accept'), item.chat_id ? 'Convite aceito. Escolha ou crie um personagem para continuar no chat.' : 'Convite aceito. O sistema agora está na sua lista.')}>Aceitar</button><button className="friends-secondary" disabled={Boolean(busy)} onClick={() => void act(item.id, () => respondToSocialInvitation(item.id, 'decline'), 'Convite recusado.')}>Recusar</button></>}</div></li>)}</ul> : <p className="friends-muted">Nenhum convite recebido.</p>}</section>
      </section>
    </div>
  </main>;
}

function ProfileLine({ profile }: { profile: SocialProfile }) {
  return <div className="friends-profile">{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : <span className="friends-avatar">{profile.username.slice(0, 1).toUpperCase()}</span>}<div><strong>@{profile.username}</strong><span>{profile.display_name}</span></div></div>;
}
