'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createSystemFriendInvitation, deleteProfileComment, getDirectMessages, getMyFriends, getMyProfile, getMySystemMemberships, getProfileComments, getPublicPlayerProfile, postProfileComment, sendDirectMessage, type DirectMessage, type ProfileComment, type PublicPlayerProfile, type PublicPlayerSystem, type SystemMembership } from '../../api';
import { hasSession } from '../../supabase-auth';
import { AppHeader } from '../shell/app-header';
import './public-profile-page.css';

export function PublicProfilePage({ username }: { username: string }) {
  const router = useRouter();
  const [profile, setProfile] = useState<PublicPlayerProfile | null>(null);
  const [systems, setSystems] = useState<PublicPlayerSystem[]>([]);
  const [profileLoading, setProfileLoading] = useState(true);
  const [comments, setComments] = useState<ProfileComment[]>([]);
  const [myId, setMyId] = useState('');
  const [isFriend, setIsFriend] = useState(false);
  const [tab, setTab] = useState<'overview' | 'systems'>('overview');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [comment, setComment] = useState('');
  const [modal, setModal] = useState<'message' | 'invite' | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [message, setMessage] = useState('');
  const [inviteSystem, setInviteSystem] = useState('');
  const [mySystems, setMySystems] = useState<SystemMembership[]>([]);
  const [busy, setBusy] = useState(false);

  const loadComments = useCallback(async () => setComments((await getProfileComments(username)).comments), [username]);
  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const detail = await getPublicPlayerProfile(username);
      setProfile(detail.profile);
      setSystems(detail.systems);
      return detail.profile;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o perfil.');
      return null;
    } finally {
      setProfileLoading(false);
    }
  }, [username]);

  useEffect(() => {
    if (!hasSession()) { router.replace('/'); return; }
    let current = true;
    void loadProfile().then(async (loadedProfile) => {
      if (!loadedProfile || !current) return;
      const [wallResult, friendsResult] = await Promise.allSettled([getProfileComments(username), getMyFriends()]);
      if (!current) return;
      if (wallResult.status === 'fulfilled') setComments(wallResult.value.comments);
      else setError(wallResult.reason instanceof Error ? wallResult.reason.message : 'Não foi possível carregar o mural.');
      if (friendsResult.status === 'fulfilled') setIsFriend(friendsResult.value.friends.some((friend) => friend.user_id === loadedProfile.user_id));
    });
    void getMyProfile().then((me) => { if (current) setMyId(me.user_id); })
      .catch((reason) => { if (current) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar sua conta.'); });
    return () => { current = false; };
  }, [username, router, loadProfile]);

  async function submitComment(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { await postProfileComment(username, comment); setComment(''); await loadComments(); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível publicar.'); } finally { setBusy(false); } }
  async function openMessages() { setModal('message'); setError(''); try { setMessages((await getDirectMessages(profile!.user_id)).messages); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível carregar a conversa.'); } }
  async function submitMessage(event: FormEvent) { event.preventDefault(); if (!profile) return; setBusy(true); try { await sendDirectMessage(profile.user_id, message); setMessage(''); setMessages((await getDirectMessages(profile.user_id)).messages); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível enviar.'); } finally { setBusy(false); } }
  async function showInvite() { setModal('invite'); setError(''); try { setMySystems((await getMySystemMemberships()).memberships.filter((system) => !systems.some((joined) => joined.id === system.game_system_id))); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível carregar seus sistemas.'); } }
  async function invite() { if (!profile || !inviteSystem) return; setBusy(true); try { const result = await createSystemFriendInvitation(inviteSystem, profile.user_id); setNotice(result.status === 'pending_owner_approval' ? 'Pedido de convite enviado ao dono do sistema.' : 'Convite enviado.'); setModal(null); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível convidar.'); } finally { setBusy(false); } }

  return <main className="public-profile"><AppHeader activeItem="Amigos" /><div className="public-profile-content">
    {error && <p role="alert" className="public-alert">{error}</p>}{notice && <p role="status" className="public-notice">{notice}</p>}
    {!profile ? profileLoading ? <p role="status">Carregando perfil…</p> : <section className="profile-load-error"><p role="status">Não foi possível exibir este perfil.</p><button onClick={() => void loadProfile()}>Tentar novamente</button></section> : <>
      <section className="player-hero" style={profile.banner_url ? { backgroundImage: `linear-gradient(90deg,rgba(17,14,24,.92),rgba(17,14,24,.16)),url("${profile.banner_url}")` } : undefined}>
        <div className="player-identity"><span className="player-avatar">{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : profile.username[0].toUpperCase()}</span><div><span className="player-kicker">PERFIL DE JOGADOR</span><h1>{profile.display_name}</h1><p>@{profile.username}</p></div></div>
        <div className="player-status-actions"><span className="player-status"><i />{profile.status || 'Entre aventuras'}</span><div className="player-actions"><button title={isFriend ? 'Convidar para uma mesa' : 'Adicione como amigo para convidar'} aria-label="Convidar para uma mesa" disabled={!isFriend} onClick={() => void showInvite()}>♜</button><button title="Enviar mensagem" aria-label="Enviar mensagem" disabled={myId === profile.user_id} onClick={() => void openMessages()}>✉</button></div></div>
        <nav className="player-tabs" aria-label="Seções do perfil"><button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Visão geral</button><button className={tab === 'systems' ? 'active' : ''} onClick={() => setTab('systems')}>Sistemas públicos <span>{systems.length}</span></button></nav>
      </section>
      <section className="player-summary" hidden={tab !== 'overview'}><div><h2>Sobre</h2><p>{profile.bio || 'Este jogador ainda não escreveu uma apresentação.'}</p>{profile.interests?.length > 0 && <div className="player-interests">{profile.interests.map((interest) => <span key={interest}>{interest}</span>)}</div>}</div><aside><span>JOGANDO EM</span><strong>{systems.length}</strong><small>sistemas públicos</small></aside></section>
      {tab === 'systems' && <section className="player-systems"><h2>Sistemas públicos</h2>{systems.length ? <ul>{systems.map((system) => <li key={system.id}><span aria-hidden="true">ᚱ</span><div><strong>{system.name}</strong><p>{system.description || 'Sistema de RPG'}</p></div></li>)}</ul> : <p>Este jogador ainda não participa de sistemas públicos.</p>}</section>}
      <section className="player-wall"><div className="wall-heading"><div><span>MURAL</span><h2>Deixe um recado</h2></div><small>{comments.length} comentários</small></div><form onSubmit={(event) => void submitComment(event)}><label className="sr-only" htmlFor="wall-comment">Escreva um comentário</label><textarea id="wall-comment" value={comment} onChange={(event) => setComment(event.target.value)} maxLength={500} placeholder="Escreva algo para este jogador…" required /><div><small>{comment.length}/500</small><button disabled={busy || !comment.trim()}>Publicar</button></div></form>
        <ul className="wall-comments">{comments.map((item) => <li key={item.id}><span className="wall-avatar">{item.author_avatar_url ? <img src={item.author_avatar_url} alt="" /> : item.author_username[0].toUpperCase()}</span><div><header><strong>{item.author_display_name}</strong><span>@{item.author_username} · {new Date(item.created_at).toLocaleDateString('pt-BR')}</span>{(item.author_user_id === myId || profile.user_id === myId) && <button aria-label="Remover comentário" onClick={() => void deleteProfileComment(item.id).then(loadComments).catch((e) => setError(e.message))}>Remover</button>}</header><p>{item.content}</p></div></li>)}</ul>{comments.length === 0 && <p className="wall-empty">Ainda não há comentários. Comece a conversa.</p>}
      </section>
    </>}
    {modal && <div className="profile-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}><section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title"><button className="modal-close" aria-label="Fechar" onClick={() => setModal(null)}>×</button>{modal === 'invite' ? <><h2 id="profile-modal-title">Convidar para uma mesa</h2><p>Escolha um sistema seu que ainda não esteja na lista deste jogador.</p><select value={inviteSystem} onChange={(event) => setInviteSystem(event.target.value)}><option value="">Selecione um sistema</option>{mySystems.map((system) => <option key={system.game_system_id} value={system.game_system_id}>{system.game_system_name}</option>)}</select>{mySystems.length === 0 && <p>Não há sistemas disponíveis para convidar este jogador.</p>}<button disabled={!inviteSystem || busy} onClick={() => void invite()}>Enviar convite</button></> : <><h2 id="profile-modal-title">Conversa com @{profile?.username}</h2><div className="dm-history" aria-live="polite">{messages.map((item) => <p className={item.sender_user_id === myId ? 'mine' : ''} key={item.id}>{item.content}<small>{new Date(item.created_at).toLocaleString('pt-BR')}</small></p>)}{messages.length === 0 && <small>Esta conversa ainda não começou.</small>}</div><form onSubmit={(event) => void submitMessage(event)}><textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} aria-label="Mensagem" placeholder="Escreva uma mensagem…" required /><button disabled={busy || !message.trim()}>Enviar</button></form></>}</section></div>}
  </div></main>;
}
