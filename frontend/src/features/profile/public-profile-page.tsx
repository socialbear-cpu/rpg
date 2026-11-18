'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createSystemFriendInvitation, deleteProfileComment, getDirectMessages, getMyFriends, getMyProfile, getMySystemMemberships, getProfileComments, getPublicPlayerProfile, postProfileComment, sendDirectMessage, updateMyProfile, type DirectMessage, type ProfileComment, type PublicPlayerProfile, type PublicPlayerSystem, type SystemMembership } from '../../api';
import { hasSession } from '../../supabase-auth';
import { AppHeader } from '../shell/app-header';
import './public-profile-page.css';

type ProfileEditDraft = { username: string; display_name: string; avatar_url: string; banner_url: string; status: string; bio: string; interests: string };

export function PublicProfilePage({ username, isOwnProfile = false, onUsernameChanged }: { username: string; isOwnProfile?: boolean; onUsernameChanged?: (username: string) => void }) {
  const router = useRouter();
  const [profile, setProfile] = useState<PublicPlayerProfile | null>(null);
  const [systems, setSystems] = useState<PublicPlayerSystem[]>([]);
  const [profileLoading, setProfileLoading] = useState(true);
  const [comments, setComments] = useState<ProfileComment[]>([]);
  const [myId, setMyId] = useState('');
  const [usernameChangeUsed, setUsernameChangeUsed] = useState<boolean | null>(null);
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);
  const [myInitial, setMyInitial] = useState('ᚱ');
  const [isFriend, setIsFriend] = useState(false);
  const [editDraft, setEditDraft] = useState<ProfileEditDraft | null>(null);
  const [tab, setTab] = useState<'overview' | 'systems'>('overview');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [comment, setComment] = useState('');
  const [modal, setModal] = useState<'message' | 'invite' | 'edit' | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const messageHistory = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState('');
  const [inviteSystem, setInviteSystem] = useState('');
  const [mySystems, setMySystems] = useState<SystemMembership[]>([]);
  const [busy, setBusy] = useState(false);
  const ownsProfile = isOwnProfile || Boolean(profile && myId === profile.user_id);
  useEffect(() => { messageHistory.current?.scrollTo({ top: messageHistory.current.scrollHeight, behavior: 'smooth' }); }, [messages, modal]);

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
    void getMyProfile().then((me) => { if (current) { setMyId(me.user_id); setUsernameChangeUsed(me.username_change_used); setMyAvatarUrl(me.avatar_url); setMyInitial(me.display_name.trim().slice(0, 1).toUpperCase() || 'ᚱ'); } })
      .catch((reason) => { if (current) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar sua conta.'); });
    return () => { current = false; };
  }, [username, router, loadProfile]);

  async function submitComment(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { await postProfileComment(username, comment); setComment(''); await loadComments(); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível publicar.'); } finally { setBusy(false); } }
  async function openMessages() { setModal('message'); setError(''); try { setMessages((await getDirectMessages(profile!.user_id)).messages); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível carregar a conversa.'); } }
  async function submitMessage(event: FormEvent) { event.preventDefault(); if (!profile) return; setBusy(true); try { await sendDirectMessage(profile.user_id, message); setMessage(''); setMessages((await getDirectMessages(profile.user_id)).messages); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível enviar.'); } finally { setBusy(false); } }
  async function showInvite() { setModal('invite'); setError(''); try { setMySystems((await getMySystemMemberships()).memberships.filter((system) => !systems.some((joined) => joined.id === system.game_system_id))); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível carregar seus sistemas.'); } }
  async function invite() { if (!profile || !inviteSystem) return; setBusy(true); try { const result = await createSystemFriendInvitation(inviteSystem, profile.user_id); setNotice(result.status === 'pending_owner_approval' ? 'Pedido de convite enviado ao dono do sistema.' : 'Convite enviado.'); setModal(null); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível convidar.'); } finally { setBusy(false); } }
  function startEditing() { if (!profile || !ownsProfile) return; setEditDraft({ username: profile.username, display_name: profile.display_name, avatar_url: profile.avatar_url ?? '', banner_url: profile.banner_url ?? '', status: profile.status ?? '', bio: profile.bio ?? '', interests: profile.interests.join(', ') }); setModal('edit'); setError(''); }
  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!editDraft || !ownsProfile) return;
    const interests = editDraft.interests.split(',').map((item) => item.trim()).filter(Boolean);
    if (interests.length > 12) { setError('Use até 12 interesses.'); return; }
    if (interests.some((item) => item.length > 40)) { setError('Cada interesse pode ter até 40 caracteres.'); return; }
    setBusy(true); setError('');
    try {
      const updated = await updateMyProfile({ display_name: editDraft.display_name.trim(), avatar_url: editDraft.avatar_url.trim() || null, banner_url: editDraft.banner_url.trim() || null, status: editDraft.status.trim() || null, bio: editDraft.bio.trim() || null, interests });
      setProfile((current) => current ? { ...current, display_name: updated.display_name, avatar_url: updated.avatar_url, banner_url: updated.banner_url, status: updated.status, bio: updated.bio, interests: updated.interests } : current);
      const nextUsername = editDraft.username.trim().toLowerCase();
      if (nextUsername !== profile?.username) {
        if (usernameChangeUsed !== false) throw new Error('A troca de @ não está disponível para esta conta.');
        const renamed = await updateMyProfile({ username: nextUsername });
        setUsernameChangeUsed(true);
        setNotice('Perfil atualizado e @ alterado.'); setModal(null);
        if (onUsernameChanged) onUsernameChanged(renamed.username!);
        else router.replace(`/players/${encodeURIComponent(renamed.username!)}`);
        return;
      }
      setNotice('Perfil atualizado.'); setModal(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar o perfil.'); }
    finally { setBusy(false); }
  }

  return <main className="public-profile"><AppHeader activeItem={ownsProfile ? '' : 'Amigos'} /><div className="public-profile-content">
    {error && <p role="alert" className="public-alert">{error}</p>}{notice && <p role="status" className="public-notice">{notice}</p>}
    {!profile ? profileLoading ? <p role="status">Carregando perfil…</p> : <section className="profile-load-error"><p role="status">Não foi possível exibir este perfil.</p><button onClick={() => void loadProfile()}>Tentar novamente</button></section> : <>
      <div className="player-banner" aria-label="Portal de Bifrost"><img src={profile.banner_url || '/bifrost-portal-hero.png'} alt="" /><span>PORTAL DE BIFROST&nbsp; ᚠ ᚱ ᚢ</span></div>
      <section className="player-hero" aria-label="Resumo do perfil">
        <div className="player-identity"><span className="player-avatar">{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : profile.username[0].toUpperCase()}</span><div><span className="player-kicker">JOGADOR(A)</span><h1>{profile.display_name}</h1><p>@{profile.username}</p><p className="player-status-copy">{profile.status || 'Entre aventuras'}</p></div></div>
        <div className="player-actions">{ownsProfile ? <button title="Editar meu perfil" aria-label="Editar meu perfil" onClick={startEditing}>✎</button> : <><button title={isFriend ? 'Convidar para uma mesa' : 'Adicione como amigo para convidar'} aria-label="Convidar para uma mesa" disabled={!isFriend} onClick={() => void showInvite()}>♜</button><button title="Enviar mensagem" aria-label="Enviar mensagem" disabled={myId === profile.user_id} onClick={() => void openMessages()}>✉</button></>}</div>
      </section>
      <nav className="player-tabs" aria-label="Seções do perfil"><button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>VISÃO GERAL</button><button className={tab === 'systems' ? 'active' : ''} onClick={() => setTab('systems')}>SISTEMAS PÚBLICOS <span>{systems.length}</span></button></nav>
      {tab === 'overview' ? <section className="player-overview"><div className="player-overview-grid"><section className="player-info"><h2><span>ᚾ</span> Sobre mim</h2><p>{profile.bio || 'Este jogador ainda não escreveu uma apresentação.'}</p></section><aside className="player-info"><h2><span>ᛉ</span> Interesses</h2>{profile.interests?.length ? <ul className="player-interests">{profile.interests.map((interest) => <li key={interest}><span>ᚦ</span>{interest}</li>)}</ul> : <p>Nenhum interesse informado.</p>}</aside></div>
        <div className="wall-divider" role="separator" aria-label="Início do mural"><span>ᚠ</span></div>
        <section className="player-wall"><div className="wall-heading"><div><h2><span>ᚷ</span> Mural</h2><p>{ownsProfile ? 'Mensagens deixadas por outros jogadores.' : `Deixe uma mensagem para ${profile.display_name} e participe da conversa.`}</p></div><small>{comments.length} RECENTES</small></div>{!ownsProfile && <><form className="wall-form" onSubmit={(event) => void submitComment(event)}><span className="my-wall-avatar">{myAvatarUrl ? <img src={myAvatarUrl} alt="" /> : myInitial}</span><label className="sr-only" htmlFor="wall-comment">Escreva um comentário</label><textarea id="wall-comment" value={comment} onChange={(event) => setComment(event.target.value)} maxLength={500} placeholder="Escreva um comentário…" required /><button disabled={busy || !comment.trim()}>Publicar</button></form><small className="wall-counter">{comment.length}/500</small></>}
          <ul className="wall-comments">{comments.map((item) => <li key={item.id}><span className="wall-avatar">{item.author_avatar_url ? <img src={item.author_avatar_url} alt="" /> : item.author_username[0].toUpperCase()}</span><div><header><strong>@{item.author_username}</strong><time>{new Date(item.created_at).toLocaleDateString('pt-BR')}</time>{(item.author_user_id === myId || profile.user_id === myId) && <button aria-label="Remover comentário" onClick={() => void deleteProfileComment(item.id).then(loadComments).catch((e) => setError(e.message))}>···</button>}</header><p>{item.content}</p></div></li>)}</ul>{comments.length === 0 && <p className="wall-empty">Ainda não há comentários. Comece a conversa.</p>}
        </section>
      </section> : <section className="player-systems"><div className="systems-heading"><div><h2><span>ᛟ</span> Sistemas públicos</h2><p>Mesas públicas das quais {profile.display_name} participa.</p></div><small>{systems.length} SISTEMAS</small></div>{systems.length ? <ul>{systems.map((system) => <li key={system.id}><span className="system-sigil">ᚱ</span><div><strong>{system.name}</strong><p>{system.description || 'Mesa pública'}</p></div><span className="system-arrow">↗</span></li>)}</ul> : <p>Este jogador ainda não participa de sistemas públicos.</p>}</section>}
    </>}
    {modal && <div className="profile-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}><section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title"><button className="modal-close" aria-label="Fechar" onClick={() => setModal(null)}>×</button>{modal === 'edit' ? <><h2 id="profile-modal-title">Editar meu perfil</h2>{error && <p className="profile-edit-error" role="alert">{error}</p>}<form className="profile-edit-form" onSubmit={(event) => void saveProfile(event)}>{usernameChangeUsed === false ? <label>Novo @<input value={editDraft?.username ?? ''} onChange={(event) => { setError(''); setEditDraft((draft) => draft ? { ...draft, username: event.target.value } : draft); }} minLength={3} maxLength={20} pattern="[a-zA-Z0-9_]+" autoCapitalize="none" required /><small>Você pode trocar seu @ uma única vez. Use 3 a 20 letras, números ou _.</small></label> : <p className="username-change-hint">{usernameChangeUsed === true ? 'Sua única troca de @ já foi usada.' : 'Verificando se a troca de @ está disponível…'}</p>}<label>Nome público<input value={editDraft?.display_name ?? ''} onChange={(event) => { setError(''); setEditDraft((draft) => draft ? { ...draft, display_name: event.target.value } : draft); }} maxLength={80} required /></label><label>Avatar (URL)<input type="url" value={editDraft?.avatar_url ?? ''} onChange={(event) => { setError(''); setEditDraft((draft) => draft ? { ...draft, avatar_url: event.target.value } : draft); }} maxLength={2048} placeholder="https://…" /></label><label>Banner (URL)<input type="url" value={editDraft?.banner_url ?? ''} onChange={(event) => { setError(''); setEditDraft((draft) => draft ? { ...draft, banner_url: event.target.value } : draft); }} maxLength={2048} placeholder="https://…" /></label><label>Status<input value={editDraft?.status ?? ''} onChange={(event) => { setError(''); setEditDraft((draft) => draft ? { ...draft, status: event.target.value } : draft); }} maxLength={120} /></label><label>Sobre mim<textarea value={editDraft?.bio ?? ''} onChange={(event) => { setError(''); setEditDraft((draft) => draft ? { ...draft, bio: event.target.value } : draft); }} maxLength={500} rows={4} /></label><label>Interesses<input value={editDraft?.interests ?? ''} onChange={(event) => { setError(''); setEditDraft((draft) => draft ? { ...draft, interests: event.target.value } : draft); }} placeholder="RPG, fantasia, worldbuilding" /><small>Até 12 itens, com no máximo 40 caracteres cada; separe por vírgula.</small></label><div className="profile-edit-actions"><button type="button" className="edit-cancel" onClick={() => setModal(null)}>Cancelar</button><button type="submit" disabled={busy || !editDraft?.display_name.trim() || usernameChangeUsed === null}>{busy ? 'Salvando…' : 'Salvar perfil'}</button></div></form></> : modal === 'invite' ? <><h2 id="profile-modal-title">Convidar para uma mesa</h2><p>Escolha um sistema seu que ainda não esteja na lista deste jogador.</p><select value={inviteSystem} onChange={(event) => setInviteSystem(event.target.value)}><option value="">Selecione um sistema</option>{mySystems.map((system) => <option key={system.game_system_id} value={system.game_system_id}>{system.game_system_name}</option>)}</select>{mySystems.length === 0 && <p>Não há sistemas disponíveis para convidar este jogador.</p>}<button disabled={!inviteSystem || busy} onClick={() => void invite()}>Enviar convite</button></> : <><h2 id="profile-modal-title">Conversa com @{profile?.username}</h2><div ref={messageHistory} className="dm-history" aria-label="Mensagens privadas" aria-live="polite">{messages.map((item) => <p className={item.sender_user_id === myId ? 'mine' : ''} key={item.id}>{item.content}<small>{new Date(item.created_at).toLocaleString('pt-BR')}</small></p>)}{messages.length === 0 && <small>Esta conversa ainda não começou.</small>}</div><form onSubmit={(event) => void submitMessage(event)}><textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} aria-label="Mensagem privada" placeholder="Escreva uma mensagem…" required /><button disabled={busy || !message.trim()}>Enviar</button></form></>}</section></div>}
  </div></main>;
}
