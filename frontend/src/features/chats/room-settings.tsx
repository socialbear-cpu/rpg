'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, getRoomSettings, saveRoomSettings, type RoomSettings, type RoomSettingsInput, type RoomRoleRule, type RoomUserRule } from '../../api';

const actions = [['view', 'Visualizar'], ['enter', 'Entrar'], ['write', 'Digitar']] as const;
const roles = [['owner', 'Owner'], ['mod', 'Moderador'], ['user', 'Jogador']] as const;

export function RoomSettingsForm({ settings, busy, onSave }: { settings: RoomSettings; busy: boolean; onSave: (input: RoomSettingsInput) => void }) {
  const [limit, setLimit] = useState(settings.chat.max_players?.toString() ?? '');
  const [roleRules, setRoleRules] = useState<RoomRoleRule[]>(settings.roles);
  const [userRules, setUserRules] = useState<RoomUserRule[]>(settings.users);
  function updateUser(userId: string, action: 'view' | 'enter' | 'write', value: string) {
    setUserRules(current => {
      const rule = { user_id: userId, view: null, enter: null, write: null, ...current.find(item => item.user_id === userId), [action]: value === 'inherit' ? null : value === 'allow' };
      return [...current.filter(item => item.user_id !== userId), rule].filter(item => item.view !== null || item.enter !== null || item.write !== null);
    });
  }
  function submit(event: FormEvent) { event.preventDefault(); onSave({ max_players: limit === '' ? null : Number(limit), roles: roleRules, users: userRules }); }
  return <form className="room-settings-form" onSubmit={submit}>
    <h3>Permissões de {settings.chat.name}</h3>
    <label>Máximo de jogadores<input type="number" min={1} max={2147483647} step={1} value={limit} onChange={event => setLimit(event.target.value)} placeholder="Sem limite" /></label>
    <p>Deixe vazio para não limitar. Cada jogador ocupa uma vaga, mesmo usando mais de um personagem.</p>
    <fieldset disabled={busy}><legend>Permissões por cargo</legend>
      {roles.map(([role, label]) => <fieldset key={role}><legend>{label}</legend>{actions.map(([action, text]) => <label key={action}>
        <input type="checkbox" checked={roleRules.find(item => item.role === role)?.[action] ?? false} onChange={event => setRoleRules(current => {
          const rule = { role, view: false, enter: false, write: false, ...current.find(item => item.role === role), [action]: event.target.checked };
          return [...current.filter(item => item.role !== role), rule];
        })} />{text}
      </label>)}</fieldset>)}
    </fieldset>
    <fieldset disabled={busy}><legend>Exceções por jogador</legend><p>A exceção individual prevalece sobre o cargo. Herdar usa a permissão do cargo.</p>
      {settings.members.map(member => <fieldset key={member.user_id}><legend>{member.display_name}</legend>{actions.map(([action, text]) => {
        const value = userRules.find(item => item.user_id === member.user_id)?.[action];
        return <label key={action}>{text}<select value={value == null ? 'inherit' : value ? 'allow' : 'deny'} onChange={event => updateUser(member.user_id, action, event.target.value)}>
          <option value="inherit">Herdar do cargo</option><option value="allow">Permitir</option><option value="deny">Negar</option>
        </select></label>;
      })}</fieldset>)}
    </fieldset>
    <button disabled={busy} type="submit">{busy ? 'Salvando…' : 'Salvar permissões'}</button>
  </form>;
}

export function RoomSettingsEditor({ chatId, onSaved, onClose }: { chatId: string; onSaved: () => void; onClose: () => void }) {
  const [settings, setSettings] = useState<RoomSettings | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; setSettings(null); setError('');
    getRoomSettings(chatId).then(value => { if (active) setSettings(value); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as permissões.'); });
    return () => { active = false; };
  }, [chatId, attempt]);
  async function save(input: RoomSettingsInput) {
    setBusy(true); setError('');
    try { setSettings(await saveRoomSettings(chatId, input)); onSaved(); }
    catch (reason) { if (reason instanceof ApiError && [403, 404].includes(reason.status)) setSettings(null); setError(reason instanceof Error ? reason.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }
  return <section className="room-settings" aria-label="Configurar sala">
    <button type="button" onClick={onClose}>Fechar configuração</button>
    {error && <p role="alert">{error}<button type="button" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button></p>}
    {settings ? <RoomSettingsForm key={`${chatId}:${attempt}`} settings={settings} busy={busy} onSave={input => void save(input)} /> : !error && <p role="status">Carregando permissões…</p>}
  </section>;
}
