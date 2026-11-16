'use client';

import { useState } from 'react';
import { createChatFriendInvitation, createSystemFriendInvitation, getMyFriends, type FriendItem } from '../../api';
import './invite-friend-control.css';

export function InviteFriendControl({ systemId, chatId }: { systemId?: string; chatId?: string }) {
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [selected, setSelected] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function show() {
    setMessage(''); setOpen(true);
    try { setFriends((await getMyFriends()).friends); }
    catch { setMessage('Não foi possível carregar sua lista de amigos.'); }
  }
  async function invite() {
    if (!selected) return;
    setBusy(true); setMessage('');
    try {
      const result = chatId ? await createChatFriendInvitation(chatId, selected) : await createSystemFriendInvitation(systemId!, selected);
      setMessage(result.status === 'pending_owner_approval' ? 'Pedido enviado ao dono para aprovação.' : result.status === 'pending_recipient' ? 'Convite enviado. Aguardando resposta do amigo.' : 'Convite registrado.');
      setSelected('');
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Não foi possível enviar o convite.'); }
    finally { setBusy(false); }
  }
  return <div className="invite-friend-control"><button type="button" onClick={() => open ? setOpen(false) : void show()}>{open ? 'Fechar convites' : 'Convidar amigo'}</button>
    {open && <div className="invite-friend-picker"><label>Amigo<select value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Escolha um amigo</option>{friends.map((friend) => <option key={friend.user_id} value={friend.user_id}>@{friend.username} · {friend.display_name}</option>)}</select></label><button type="button" disabled={!selected || busy} onClick={() => void invite()}>{busy ? 'Enviando…' : 'Enviar convite'}</button>{friends.length === 0 && <span>Adicione amigos antes de enviar convites.</span>}{message && <span role="status">{message}</span>}</div>}
  </div>;
}
