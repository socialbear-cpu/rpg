'use client';

import { useCallback, useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getMyFriends, getSocialInvitations, removeMyFriend, respondToFriendRequest, respondToSocialInvitation, searchSocialProfiles, sendFriendRequest, type FriendshipList, type SocialInvitationList, type SocialProfile } from '../../api';
import { hasSession } from '../../supabase-auth';
import { AppHeader } from '../shell/app-header';
import { friendRequestState } from './friend-state';
import './friends-page.css';

type FriendsTab = 'friends' | 'requests' | 'invitations';
const friendsTabs: FriendsTab[] = ['friends', 'requests', 'invitations'];

export function FriendsPage() {
  const router = useRouter();
  const [friends, setFriends] = useState<FriendshipList>({ friends: [], incoming_requests: [], outgoing_requests: [] });
  const [invitations, setInvitations] = useState<SocialInvitationList>({ owner_approvals: [], recipient_invitations: [] });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SocialProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadErrors, setLoadErrors] = useState<{ friends: string | null; invitations: string | null }>({ friends: null, invitations: null });
  const [notice, setNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FriendsTab>('friends');
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const [graph, inbox] = await Promise.allSettled([getMyFriends(), getSocialInvitations()]);
    if (graph.status === 'fulfilled') setFriends(graph.value);
    if (inbox.status === 'fulfilled') setInvitations(inbox.value);
    setLoadErrors({
      friends: graph.status === 'rejected' ? 'Não foi possível carregar amigos e pedidos.' : null,
      invitations: inbox.status === 'rejected' ? 'Não foi possível carregar os convites para jogos.' : null,
    });
    setLoading(false);
  }, []);
  useEffect(() => {
    if (!hasSession()) { router.replace('/'); return; }
    void load();
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') void load(true); };
    const timer = window.setInterval(refreshWhenVisible, 15000);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [load, router]);
  async function search(event: FormEvent) {
    event.preventDefault(); setError(null); setNotice(null);
    try { setResults((await searchSocialProfiles(query)).results); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível buscar jogadores.'); }
  }
  async function act(key: string, operation: () => Promise<unknown>, message: string) {
    setBusy(key); setError(null);
    try { await operation(); setNotice(message); await load(); if (key.startsWith('friend:')) setResults((current) => current.filter((profile) => profile.user_id !== key.slice(7))); }
    catch (reason) {
      await load(true);
      setError(reason instanceof Error ? reason.message : 'Não foi possível concluir a ação.');
    }
    finally { setBusy(null); }
  }
  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, tab: FriendsTab) {
    const index = friendsTabs.indexOf(tab);
    let nextTab: FriendsTab | undefined;
    if (event.key === 'ArrowRight') nextTab = friendsTabs[(index + 1) % friendsTabs.length];
    if (event.key === 'ArrowLeft') nextTab = friendsTabs[(index - 1 + friendsTabs.length) % friendsTabs.length];
    if (event.key === 'Home') nextTab = friendsTabs[0];
    if (event.key === 'End') nextTab = friendsTabs[friendsTabs.length - 1];
    if (!nextTab) return;
    event.preventDefault();
    setActiveTab(nextTab);
    document.getElementById(`friends-tab-${nextTab}`)?.focus();
  }

  const tabCounts: Record<FriendsTab, number> = {
    friends: friends.friends.length,
    requests: friends.incoming_requests.length + friends.outgoing_requests.length,
    invitations: invitations.owner_approvals.length + invitations.recipient_invitations.length,
  };

  return (
    <main className="friends-page">
      <AppHeader activeItem="Amigos" />
      <div className="friends-content">
        <header className="friends-heading">
          <span>REDE BIFROST</span>
          <h1>Amigos</h1>
          <p>Encontre jogadores, gerencie pedidos e acompanhe convites para suas aventuras.</p>
        </header>

        {error && <p role="alert" className="friends-alert">{error}</p>}
        {notice && <p role="status" className="friends-notice">{notice}</p>}

        <section className="friends-search-panel" aria-labelledby="friends-search-title">
          <div className="friends-search-copy">
            <span className="friends-eyebrow">NOVAS CONEXÕES</span>
            <h2 id="friends-search-title">Encontre jogadores</h2>
            <p>Busque pelo nick e convide alguém para sua próxima aventura.</p>
          </div>
          <form className="friends-search" onSubmit={(event) => void search(event)}>
            <label htmlFor="friend-search">Buscar pelo nick</label>
            <div>
              <span aria-hidden="true">@</span>
              <input id="friend-search" value={query} onChange={(event) => setQuery(event.target.value)} minLength={2} maxLength={20} pattern="[a-zA-Z0-9_]+" placeholder="nome_do_jogador" required />
              <button type="submit">Buscar</button>
            </div>
          </form>
          {results.length > 0 && (
            <ul className="friends-list friends-search-results" aria-label="Resultados da busca">
              {results.map((profile) => {
                const relationship = friendRequestState(profile.user_id, friends);
                return (
                  <li key={profile.user_id}>
                    <ProfileLine profile={profile} />
                    {relationship.state === 'friend' ? <button className="friends-secondary" disabled>Amigo</button>
                      : relationship.state === 'outgoing' ? <button className="friends-secondary" disabled>Pedido enviado</button>
                        : relationship.state === 'incoming' ? (
                          <div className="friends-actions">
                            <button disabled={Boolean(busy)} onClick={() => void act(relationship.requestId, () => respondToFriendRequest(relationship.requestId, 'accept'), 'Pedido aceito.')}>Aceitar pedido</button>
                            <button className="friends-secondary" disabled={Boolean(busy)} onClick={() => void act(relationship.requestId, () => respondToFriendRequest(relationship.requestId, 'decline'), 'Pedido recusado.')}>Recusar</button>
                          </div>
                        ) : <button disabled={busy === `friend:${profile.user_id}`} onClick={() => void act(`friend:${profile.user_id}`, () => sendFriendRequest(profile.user_id), `Pedido enviado para @${profile.username}.`)}>Adicionar</button>}
                  </li>
                );
              })}
            </ul>
          )}
          {!loading && results.length === 0 && query.length >= 2 && <p className="friends-muted friends-search-empty">Busque um nick para ver jogadores.</p>}
        </section>

        <section className="friends-dashboard" aria-label="Sua rede social">
          <div className="friends-tabs" role="tablist" aria-label="Seções de amigos">
            {friendsTabs.map((tab) => {
              const label = tab === 'friends' ? 'Amigos' : tab === 'requests' ? 'Pedidos' : 'Convites';
              return (
                <button
                  key={tab}
                  id={`friends-tab-${tab}`}
                  className={`friends-tab${activeTab === tab ? ' is-active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  aria-controls={`friends-panel-${tab}`}
                  tabIndex={activeTab === tab ? 0 : -1}
                  onClick={() => setActiveTab(tab)}
                  onKeyDown={(event) => handleTabKeyDown(event, tab)}
                >
                  <span>{label}</span>
                  <span className="friends-tab-count" aria-label={`${tabCounts[tab]} ${tabCounts[tab] === 1 ? 'item' : 'itens'}`}>{tabCounts[tab]}</span>
                </button>
              );
            })}
          </div>

          <section className="friends-panel friends-tab-panel" id="friends-panel-friends" role="tabpanel" aria-labelledby="friends-tab-friends" hidden={activeTab !== 'friends'}>
            <div className="friends-panel-heading"><div><span className="friends-eyebrow">SUA REDE</span><h2>Meus amigos</h2></div><span className="friends-total">{friends.friends.length} {friends.friends.length === 1 ? 'amigo' : 'amigos'}</span></div>
            {loadErrors.friends && <p role="alert" className="friends-section-error">{loadErrors.friends}</p>}
            {loading ? <p className="friends-loading" role="status">Carregando seus amigos…</p>
              : friends.friends.length > 0 ? (
                <ul className="friends-list">
                  {friends.friends.map((friend) => (
                    <li key={friend.user_id}>
                      <ProfileLine profile={friend} />
                      <button className="friends-secondary" disabled={busy === friend.user_id} onClick={() => void act(friend.user_id, () => removeMyFriend(friend.user_id), `@${friend.username} removido da sua lista.`)}>Remover</button>
                    </li>
                  ))}
                </ul>
              ) : !loadErrors.friends && <EmptyState symbol="✦" title="Sua lista começa aqui" message="Encontre jogadores e adicione quem você quer nas próximas aventuras." />}
          </section>

          <section className="friends-panel friends-tab-panel" id="friends-panel-requests" role="tabpanel" aria-labelledby="friends-tab-requests" hidden={activeTab !== 'requests'}>
            <div className="friends-panel-heading"><div><span className="friends-eyebrow">CONEXÕES</span><h2>Pedidos de amizade</h2></div><span className="friends-total">{tabCounts.requests} pendentes</span></div>
            {loadErrors.friends && <p role="alert" className="friends-section-error">{loadErrors.friends}</p>}
            {loading ? <p className="friends-loading" role="status">Carregando pedidos…</p>
              : tabCounts.requests > 0 ? (
                <ul className="friends-list">
                  {friends.incoming_requests.map((item) => (
                    <li key={item.id}>
                      <ProfileLine profile={item} />
                      <div className="friends-actions">
                        <button disabled={Boolean(busy)} onClick={() => void act(item.id, () => respondToFriendRequest(item.id, 'accept'), 'Pedido aceito.')}>Aceitar</button>
                        <button className="friends-secondary" disabled={Boolean(busy)} onClick={() => void act(item.id, () => respondToFriendRequest(item.id, 'decline'), 'Pedido recusado.')}>Recusar</button>
                      </div>
                    </li>
                  ))}
                  {friends.outgoing_requests.map((item) => (
                    <li key={item.id}>
                      <ProfileLine profile={item} />
                      <button className="friends-secondary" disabled={Boolean(busy)} onClick={() => void act(item.id, () => respondToFriendRequest(item.id, 'cancel'), 'Pedido cancelado.')}>Cancelar pedido</button>
                    </li>
                  ))}
                </ul>
              ) : !loadErrors.friends && <EmptyState symbol="↗" title="Nenhum pedido pendente" message="Quando alguém enviar ou receber um pedido, ele aparecerá aqui." />}
          </section>

          <section className="friends-panel friends-tab-panel" id="friends-panel-invitations" role="tabpanel" aria-labelledby="friends-tab-invitations" hidden={activeTab !== 'invitations'}>
            <div className="friends-panel-heading"><div><span className="friends-eyebrow">AVENTURAS</span><h2>Convites e aprovações</h2></div><span className="friends-total">{tabCounts.invitations} {tabCounts.invitations === 1 ? 'item' : 'itens'}</span></div>
            {loadErrors.invitations && <p role="alert" className="friends-section-error">{loadErrors.invitations}</p>}
            {loading ? <p className="friends-loading" role="status">Carregando convites…</p>
              : tabCounts.invitations > 0 ? (
                <div className="friends-invitation-groups">
                  <InvitationGroup title="Aprovações como dono" count={invitations.owner_approvals.length} empty="Nenhuma solicitação aguardando sua aprovação.">
                    <ul className="friends-list">
                      {invitations.owner_approvals.map((item) => (
                        <li key={item.id}>
                          <div className="friends-invitation-copy"><strong>@{item.username}</strong><span>{item.chat_name ? `Chat ${item.chat_name}` : item.system_name}</span></div>
                          <div className="friends-actions">
                            <button disabled={Boolean(busy)} onClick={() => void act(item.id, () => respondToSocialInvitation(item.id, 'approve'), 'Convite aprovado e enviado.')}>Aprovar</button>
                            <button className="friends-secondary" disabled={Boolean(busy)} onClick={() => void act(item.id, () => respondToSocialInvitation(item.id, 'decline'), 'Solicitação recusada.')}>Recusar</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </InvitationGroup>
                  <InvitationGroup title="Convites para você" count={invitations.recipient_invitations.length} empty="Nenhum convite recebido.">
                    <ul className="friends-list">
                      {invitations.recipient_invitations.map((item) => (
                        <li key={item.id}>
                          <div className="friends-invitation-copy"><strong>@{item.username}</strong><span>{item.chat_name ? `Chat ${item.chat_name}` : item.system_name}</span></div>
                          <div className="friends-actions">
                            {item.status === 'accepted' && item.chat_id
                              ? <button onClick={() => router.push(`/systems/${encodeURIComponent(item.game_system_id)}/characters?invitationId=${encodeURIComponent(item.id)}&chatId=${encodeURIComponent(item.chat_id!)}`)}>Continuar no chat</button>
                              : <>
                                <button disabled={Boolean(busy)} onClick={() => void act(item.id, () => respondToSocialInvitation(item.id, 'accept'), item.chat_id ? 'Convite aceito. Escolha ou crie um personagem para continuar no chat.' : 'Convite aceito. O sistema agora está na sua lista.')}>Aceitar</button>
                                <button className="friends-secondary" disabled={Boolean(busy)} onClick={() => void act(item.id, () => respondToSocialInvitation(item.id, 'decline'), 'Convite recusado.')}>Recusar</button>
                              </>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </InvitationGroup>
                </div>
              ) : !loadErrors.invitations && <EmptyState symbol="◇" title="Nenhum convite por enquanto" message="Convites para sistemas e chats aparecerão nesta área." />}
          </section>
        </section>
      </div>
    </main>
  );
}

function EmptyState({ symbol, title, message }: { symbol: string; title: string; message: string }) {
  return <div className="friends-empty"><span aria-hidden="true">{symbol}</span><strong>{title}</strong><p>{message}</p></div>;
}

function InvitationGroup({ title, count, empty, children }: { title: string; count: number; empty: string; children: React.ReactNode }) {
  return <section className="friends-invitation-group"><div className="friends-subheading"><h3>{title}</h3><span>{count}</span></div>{count > 0 ? children : <p className="friends-muted">{empty}</p>}</section>;
}

function ProfileLine({ profile }: { profile: SocialProfile }) {
  return <Link className="friends-profile" href={`/players/${encodeURIComponent(profile.username)}`}>{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : <span className="friends-avatar">{profile.username.slice(0, 1).toUpperCase()}</span>}<div><strong>@{profile.username}</strong><span>{profile.display_name}</span></div></Link>;
}
