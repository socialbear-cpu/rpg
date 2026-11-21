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
  const [searching, setSearching] = useState(false);
  const [emptySearchQuery, setEmptySearchQuery] = useState<string | null>(null);
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
    setSearching(true); setEmptySearchQuery(null); setResults([]);
    try {
      const found = await searchSocialProfiles(query);
      setResults(found.results);
      setEmptySearchQuery(found.results.length === 0 ? query : null);
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível buscar jogadores.'); }
    finally { setSearching(false); }
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
          <div className="friends-heading-copy">
            <span className="friends-eyebrow">SOCIAL / BIFROST RPG</span>
            <h1>Boas histórias.<br /><span>Melhores companhias.</span></h1>
            <p>Sua próxima aventura começa com uma conexão. Reúna seus amigos e encontre quem vai jogar ao seu lado.</p>
          </div>
          <div className="friends-hero-art" aria-hidden="true">
            <svg viewBox="0 0 320 220" fill="none">
              <defs><linearGradient id="friends-bridge-spectrum" x1="50" y1="0" x2="270" y2="220" gradientUnits="userSpaceOnUse"><stop stopColor="#72cbd4" /><stop offset=".5" stopColor="#ceb4ff" /><stop offset="1" stopColor="#dc9eae" /></linearGradient></defs>
              <circle cx="160" cy="100" r="83" stroke="currentColor" opacity=".18" />
              <circle cx="160" cy="100" r="62" stroke="currentColor" strokeDasharray="2 8" opacity=".35" />
              <path d="m146 86-83 134m90-134-28 134m35-134v134m7-134 28 134m-21-134 83 134M146 86h28" stroke="url(#friends-bridge-spectrum)" opacity=".55" />
              <path d="m132 74 28-28 28 28m-56 16 28-28 28 28" stroke="currentColor" strokeWidth="1.5" />
              <path d="M51 75h10m-5-5v10m201 36h10m-5-5v10M207 27h6m-3-3v6" stroke="currentColor" />
              <circle cx="91" cy="153" r="3" fill="currentColor" /><circle cx="236" cy="61" r="2" fill="currentColor" />
            </svg>
            <span>UMA PONTE ENTRE JOGADORES</span>
          </div>
        </header>

        {error && <p role="alert" className="friends-alert">{error}</p>}
        {notice && <p role="status" className="friends-notice">{notice}</p>}

        <div className="friends-workspace">
          <aside className="friends-search-panel" aria-label="Encontrar jogadores">
            <div className="friends-search-copy">
              <span className="friends-search-icon"><SocialIcon kind="search" /></span>
              <span className="friends-eyebrow">NOVAS CONEXÕES</span>
              <h2 id="friends-search-title">Encontre jogadores</h2>
              <p>Já sabe quem está procurando? Encontre pelo nick e envie um pedido de amizade.</p>
            </div>
            <form className="friends-search" onSubmit={(event) => void search(event)}>
              <label htmlFor="friend-search">Buscar pelo nick</label>
              <div>
                <span aria-hidden="true">@</span>
                <input id="friend-search" value={query} onChange={(event) => { setQuery(event.target.value); setEmptySearchQuery(null); setResults([]); }} minLength={2} maxLength={20} pattern="[a-zA-Z0-9_]+" placeholder="nome_do_jogador" disabled={searching} required />
              </div>
              <button type="submit" disabled={searching}>{searching ? 'Buscando…' : 'Buscar jogador'}<SocialIcon kind="arrow" /></button>
            </form>
            {searching && <p className="friends-muted" role="status">Procurando jogadores…</p>}
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
            {emptySearchQuery !== null && <p className="friends-muted friends-search-empty" role="status">Nenhum jogador encontrado para @{emptySearchQuery}.</p>}
            <div className="friends-search-tip"><SocialIcon kind="friends" /><p>Ao adicionar alguém, vocês poderão se convidar para sistemas e chats.</p></div>
          </aside>

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
                    <SocialIcon kind={tab} />
                    <span>{label}</span>
                    <span className="friends-tab-count" aria-label={loading || (tab === 'invitations' ? loadErrors.invitations : loadErrors.friends) ? 'Contagem indisponível' : `${tabCounts[tab]} ${tabCounts[tab] === 1 ? 'item' : 'itens'}`}>{loading || (tab === 'invitations' ? loadErrors.invitations : loadErrors.friends) ? '—' : tabCounts[tab]}</span>
                  </button>
                );
              })}
            </div>

            <section className="friends-panel friends-tab-panel" id="friends-panel-friends" role="tabpanel" tabIndex={0} aria-labelledby="friends-tab-friends" hidden={activeTab !== 'friends'}>
              <div className="friends-panel-heading"><div><span className="friends-eyebrow">SEU GRUPO DE AVENTURAS</span><h2>Meus amigos</h2><p>As pessoas que fazem parte da sua jornada.</p></div></div>
              {loadErrors.friends && <p role="alert" className="friends-section-error">{loadErrors.friends}</p>}
              {loading ? <p className="friends-loading" role="status">Carregando seus amigos…</p>
                : friends.friends.length > 0 ? (
                  <ul className="friends-list friends-roster">
                    {friends.friends.map((friend) => (
                      <li key={friend.user_id}>
                        <ProfileLine profile={friend} />
                        <div className="friends-card-actions"><Link href={`/players/${encodeURIComponent(friend.username)}`}>Ver perfil <SocialIcon kind="arrow" /></Link><button className="friends-secondary" disabled={busy === friend.user_id} aria-label={`Remover @${friend.username} dos amigos`} onClick={() => void act(friend.user_id, () => removeMyFriend(friend.user_id), `@${friend.username} removido da sua lista.`)}>Remover</button></div>
                      </li>
                    ))}
                  </ul>
                ) : !loadErrors.friends && <EmptyState kind="friends" title="Sua lista começa aqui" message="Toda boa mesa começa com boas companhias. Busque um jogador pelo nick e faça sua primeira conexão." action={<button className="friends-empty-action" type="button" onClick={() => document.getElementById('friend-search')?.focus()}>Encontrar jogadores <SocialIcon kind="arrow" /></button>} />}
            </section>

            <section className="friends-panel friends-tab-panel" id="friends-panel-requests" role="tabpanel" tabIndex={0} aria-labelledby="friends-tab-requests" hidden={activeTab !== 'requests'}>
              <div className="friends-panel-heading"><div><span className="friends-eyebrow">NOVAS COMPANHIAS</span><h2>Pedidos de amizade</h2><p>Gerencie quem quer fazer parte da sua rede.</p></div></div>
              {loadErrors.friends && <p role="alert" className="friends-section-error">{loadErrors.friends}</p>}
              {loading ? <p className="friends-loading" role="status">Carregando pedidos…</p>
                : tabCounts.requests > 0 ? (
                  <ul className="friends-list">
                    {friends.incoming_requests.map((item) => (
                      <li key={item.id}>
                        <div className="friends-request-profile"><span className="friends-request-direction">Recebido</span><ProfileLine profile={item} /></div>
                        <div className="friends-actions">
                          <button disabled={Boolean(busy)} onClick={() => void act(item.id, () => respondToFriendRequest(item.id, 'accept'), 'Pedido aceito.')}>Aceitar</button>
                          <button className="friends-secondary" disabled={Boolean(busy)} onClick={() => void act(item.id, () => respondToFriendRequest(item.id, 'decline'), 'Pedido recusado.')}>Recusar</button>
                        </div>
                      </li>
                    ))}
                    {friends.outgoing_requests.map((item) => (
                      <li key={item.id}>
                        <div className="friends-request-profile"><span className="friends-request-direction">Enviado</span><ProfileLine profile={item} /></div>
                        <button className="friends-secondary" disabled={Boolean(busy)} onClick={() => void act(item.id, () => respondToFriendRequest(item.id, 'cancel'), 'Pedido cancelado.')}>Cancelar pedido</button>
                      </li>
                    ))}
                  </ul>
                ) : !loadErrors.friends && <EmptyState kind="requests" title="Tudo em dia por aqui" message="Seus pedidos recebidos e enviados aparecerão aqui. Uma nova companhia pode estar a um convite de distância." />}
            </section>

            <section className="friends-panel friends-tab-panel" id="friends-panel-invitations" role="tabpanel" tabIndex={0} aria-labelledby="friends-tab-invitations" hidden={activeTab !== 'invitations'}>
              <div className="friends-panel-heading"><div><span className="friends-eyebrow">PRÓXIMO CAPÍTULO</span><h2>Convites e aprovações</h2><p>Novas mesas e histórias esperando por você.</p></div></div>
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
                ) : !loadErrors.invitations && <EmptyState kind="invitations" title="A próxima aventura vem aí" message="Quando alguém convidar você para um sistema ou chat, seu convite estará aqui." />}
            </section>
          </section>
        </div>
        <div className="friends-footer"><span aria-hidden="true" />Uma ponte entre mestres, jogadores e histórias.<span aria-hidden="true" /></div>
      </div>
    </main>
  );
}

function EmptyState({ kind, title, message, action }: { kind: FriendsTab; title: string; message: string; action?: React.ReactNode }) {
  return <div className="friends-empty"><span className="friends-empty-icon"><SocialIcon kind={kind} /></span><h3>{title}</h3><p>{message}</p>{action}</div>;
}

function SocialIcon({ kind }: { kind: FriendsTab | 'search' | 'arrow' }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'friends' ? <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2" /></>
      : kind === 'requests' ? <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2m4-14v6m-3-3h6" /></>
        : kind === 'invitations' ? <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>
          : kind === 'search' ? <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>
            : <path d="M5 12h14m-5-5 5 5-5 5" />}
  </svg>;
}

function InvitationGroup({ title, count, empty, children }: { title: string; count: number; empty: string; children: React.ReactNode }) {
  return <section className="friends-invitation-group"><div className="friends-subheading"><h3>{title}</h3><span>{count}</span></div>{count > 0 ? children : <p className="friends-muted">{empty}</p>}</section>;
}

function ProfileLine({ profile }: { profile: SocialProfile }) {
  return <Link className="friends-profile" href={`/players/${encodeURIComponent(profile.username)}`}>{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : <span className="friends-avatar">{profile.username.slice(0, 1).toUpperCase()}</span>}<div><strong>@{profile.username}</strong><span>{profile.display_name}</span></div></Link>;
}
