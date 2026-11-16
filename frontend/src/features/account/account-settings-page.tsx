'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  acceptSystemOwnerTransfer,
  cancelSystemOwnerTransfer,
  deactivateMyAccount,
  deleteMyAccount,
  getMyAccountSettings,
  getMyProfile,
  reactivateMyAccount,
  requestSystemOwnerTransfer,
  updateMyProfile,
  type MyAccountSettings,
  type ProfilePatch,
} from '../../api';
import {
  clearPendingAccountAction,
  consumeAuthCallback,
  currentAccessToken,
  getCurrentAuthUser,
  hasSession,
  readPendingAccountAction,
  sendAccountConfirmationEmail,
  signOut,
  updatePassword,
  type PendingAccountAction,
} from '../../supabase-auth';
import { AppHeader } from '../shell/app-header';
import { UsernameSettingsField } from './username-settings-field';
import './account-settings-page.css';

type ProfileDraft = { displayName: string; phone: string };
type AccountActionRequest = PendingAccountAction extends infer Action
  ? Action extends { userId: string }
    ? Omit<Action, 'userId'>
    : never
  : never;

function draftFrom(account: MyAccountSettings): ProfileDraft {
  return { displayName: account.profile.display_name, phone: account.profile.phone ?? '' };
}

export function AccountSettingsPage() {
  const router = useRouter();
  const [account, setAccount] = useState<MyAccountSettings | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [usernameChangeUsed, setUsernameChangeUsed] = useState<boolean | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAccountAction | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageIsError, setMessageIsError] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [transferTargets, setTransferTargets] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    const callback = consumeAuthCallback();
    if (callback.error) {
      setMessage(callback.error);
      setMessageIsError(true);
    }
    if (!hasSession()) {
      router.replace('/');
      return () => { active = false; };
    }
    async function load() {
      try {
        if (callback.emailSignIn) {
          const action = readPendingAccountAction();
          if (action) {
            const user = await getCurrentAuthUser();
            if (user.id !== action.userId) {
              clearPendingAccountAction();
              if (active) {
                setMessage('Este link foi aberto em uma conta diferente da que solicitou a alteração.');
                setMessageIsError(true);
              }
            } else if (active) {
              setPendingAction(action);
            }
          }
        }
        const [value, profile] = await Promise.all([getMyAccountSettings(), getMyProfile()]);
        if (active) {
          setAccount(value);
          setDraft(draftFrom(value));
          setUsernameDraft(profile.username ?? '');
          setUsernameChangeUsed(profile.username_change_used);
        }
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : 'Não foi possível carregar as configurações da conta.');
          setMessageIsError(true);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [router]);

  function showMessage(value: string, error = false) {
    setMessage(value);
    setMessageIsError(error);
  }

  async function sendAction(action: AccountActionRequest, successMessage = 'Enviamos um link de confirmação para o e-mail da sua conta.') {
    setBusy(true);
    showMessage('');
    try {
      await sendAccountConfirmationEmail(action);
      showMessage(successMessage);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'Não foi possível enviar o link de confirmação.', true);
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    const patch: ProfilePatch = {
      display_name: draft.displayName.trim(),
      phone: draft.phone.trim() || null,
    };
    await sendAction({ kind: 'profile-update', patch });
  }

  async function saveUsername(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account || usernameChangeUsed !== false || busy) return;
    const username = usernameDraft.trim().toLowerCase();
    if (username === account.profile.username) {
      showMessage('Este já é o seu @.');
      return;
    }
    setBusy(true);
    showMessage('');
    try {
      const updated = await updateMyProfile({ username });
      if (!updated.username) throw new Error('Não foi possível atualizar o @ do perfil.');
      setAccount((current) => current ? { ...current, profile: { ...current.profile, username: updated.username! } } : current);
      setUsernameDraft(updated.username);
      setUsernameChangeUsed(updated.username_change_used);
      showMessage('Seu @ foi alterado.');
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'Não foi possível alterar o @.', true);
    } finally {
      setBusy(false);
    }
  }

  async function requestTransfer(systemId: string) {
    const targetUserId = transferTargets[systemId];
    if (!targetUserId) return;
    await sendAction({ kind: 'request-transfer', systemId, targetUserId });
  }

  async function confirmAction() {
    if (!pendingAction || busy) return;
    if (pendingAction.kind === 'delete' && deleteConfirmation !== 'EXCLUIR') return;
    if (pendingAction.kind === 'password-change') {
      if (newPassword.length < 6 || newPassword !== repeatPassword) {
        showMessage('Informe a nova senha com pelo menos 6 caracteres e confirme-a corretamente.', true);
        return;
      }
    }
    setBusy(true);
    showMessage('');
    try {
      switch (pendingAction.kind) {
        case 'profile-update':
          await updateMyProfile(pendingAction.patch);
          setAccount(await getMyAccountSettings());
          setDraft((current) => current ? { ...current, ...('display_name' in pendingAction.patch ? { displayName: pendingAction.patch.display_name ?? '' } : {}), ...('phone' in pendingAction.patch ? { phone: pendingAction.patch.phone ?? '' } : {}) } : current);
          clearPendingAccountAction();
          setPendingAction(null);
          showMessage('Informações da conta atualizadas.');
          break;
        case 'password-change':
          await updatePassword(newPassword);
          clearPendingAccountAction();
          setPendingAction(null);
          router.replace('/');
          break;
        case 'deactivate':
          await deactivateMyAccount();
          clearPendingAccountAction();
          setPendingAction(null);
          await signOut();
          router.replace('/');
          break;
        case 'reactivate':
          await reactivateMyAccount();
          clearPendingAccountAction();
          setPendingAction(null);
          setAccount(await getMyAccountSettings());
          showMessage('Conta reativada.');
          break;
        case 'delete':
          await deleteMyAccount();
          clearPendingAccountAction();
          setPendingAction(null);
          await signOut();
          router.replace('/');
          break;
        case 'request-transfer':
          await requestSystemOwnerTransfer(pendingAction.systemId, pendingAction.targetUserId);
          clearPendingAccountAction();
          setPendingAction(null);
          setAccount(await getMyAccountSettings());
          showMessage('Pedido de transferência enviado. O novo titular precisa confirmar por e-mail.');
          break;
        case 'accept-transfer':
          await acceptSystemOwnerTransfer(pendingAction.transferId);
          clearPendingAccountAction();
          setPendingAction(null);
          setAccount(await getMyAccountSettings());
          showMessage('Transferência aceita; agora você é titular do sistema.');
          break;
        case 'cancel-transfer':
          await cancelSystemOwnerTransfer(pendingAction.transferId);
          clearPendingAccountAction();
          setPendingAction(null);
          setAccount(await getMyAccountSettings());
          showMessage('Pedido de transferência cancelado.');
          break;
      }
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'Não foi possível concluir a alteração.', true);
    } finally {
      setBusy(false);
    }
  }

  if (!hasSession() && !currentAccessToken()) return null;

  return <main className="shell account-settings-page">
    <AppHeader activeItem="" backHref="/dashboard" backLabel="Voltar aos sistemas" />
    <section className="intro">
      <p className="eyebrow">SUA CONTA</p>
      <h1>Configurações da conta</h1>
      <p>Consulte seus dados e gerencie o acesso à sua conta.</p>
    </section>
    {message && <p className={`notice${messageIsError ? ' error' : ''}`} role={messageIsError ? 'alert' : 'status'}>{message}</p>}
    {loading ? <p role="status">Carregando configurações da conta…</p> : account && draft && <>
      {!account.is_active && <div className="account-settings-inactive" role="status">
        <strong>Conta desativada</strong>
        <p>Seus dados estão preservados. Confirme pelo e-mail para reativar o acesso.</p>
        <button type="button" disabled={busy} onClick={() => void sendAction({ kind: 'reactivate' })}>Enviar link para reativar</button>
      </div>}

      <section className="account-settings-card" aria-labelledby="account-info-heading">
        <div className="account-settings-heading"><div><p className="eyebrow">DADOS PESSOAIS</p><h2 id="account-info-heading">Informações da conta</h2></div></div>
        <UsernameSettingsField
          username={account.profile.username}
          draft={usernameDraft}
          changeUsed={usernameChangeUsed}
          busy={busy}
          enabled={account.is_active}
          onDraftChange={setUsernameDraft}
          onSave={(event) => { void saveUsername(event); }}
        />
        <form className="account-settings-form" onSubmit={(event) => void saveProfile(event)}>
          <label>E-mail<input type="email" value={account.email ?? ''} readOnly /></label>
          <label>Nome de exibição<input value={draft.displayName} maxLength={80} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} disabled={!account.is_active} required /></label>
          <label>Telefone<input type="tel" value={draft.phone} maxLength={32} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} disabled={!account.is_active} placeholder="Opcional" /></label>
          <button type="submit" disabled={!account.is_active || busy}>{busy ? 'Enviando…' : 'Salvar informações'}</button>
          <p className="account-settings-hint">As alterações só serão aplicadas depois que você confirmar o link enviado ao seu e-mail.</p>
        </form>
      </section>

      <section className="account-settings-card" aria-labelledby="account-security-heading">
        <div className="account-settings-heading"><div><p className="eyebrow">PROTEÇÃO</p><h2 id="account-security-heading">Senha e segurança</h2></div></div>
        <div className="account-settings-action">
          <div><strong>Senha</strong><p>Enviaremos um link para confirmar sua identidade antes de definir uma nova senha.</p></div>
          <button type="button" disabled={!account.is_active || busy} onClick={() => void sendAction({ kind: 'password-change' })}>Alterar senha</button>
        </div>
      </section>

      {pendingAction && <section className="account-settings-confirm" aria-labelledby="account-confirm-heading">
        <p className="eyebrow">CONFIRMAÇÃO POR E-MAIL</p>
        <h2 id="account-confirm-heading">{confirmationTitle(pendingAction)}</h2>
        <p>{confirmationDescription(pendingAction)}</p>
        {pendingAction.kind === 'password-change' && <div className="account-settings-form">
          <label>Nova senha<input type="password" autoComplete="new-password" minLength={6} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label>
          <label>Confirme a nova senha<input type="password" autoComplete="new-password" minLength={6} value={repeatPassword} onChange={(event) => setRepeatPassword(event.target.value)} required /></label>
        </div>}
        {pendingAction.kind === 'delete' && <label className="account-settings-delete-check">Digite EXCLUIR para confirmar<input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off" /></label>}
        <button className={pendingAction.kind === 'delete' || pendingAction.kind === 'deactivate' ? 'account-settings-danger' : ''} type="button" disabled={busy || (pendingAction.kind === 'delete' && deleteConfirmation !== 'EXCLUIR')} onClick={() => void confirmAction()}>
          {busy ? 'Confirmando…' : confirmationButton(pendingAction)}
        </button>
        <button className="account-settings-cancel" type="button" disabled={busy} onClick={() => { clearPendingAccountAction(); setPendingAction(null); setDeleteConfirmation(''); }}>Cancelar</button>
      </section>}

      <section className="account-settings-card" aria-labelledby="account-transfers-heading">
        <div className="account-settings-heading"><div><p className="eyebrow">SISTEMAS COMPARTILHADOS</p><h2 id="account-transfers-heading">Transferências de titularidade</h2></div></div>
        {account.incoming_transfers.length > 0 && <div className="account-settings-transfer-list">
          {account.incoming_transfers.map((transfer) => <div className="account-settings-transfer" key={transfer.id}>
            <p><strong>{transfer.system_name}</strong> — {transfer.from_display_name} quer transferir este sistema para você.</p>
            <button type="button" disabled={!account.is_active || busy} onClick={() => void sendAction({ kind: 'accept-transfer', transferId: transfer.id })}>Confirmar por e-mail e aceitar</button>
          </div>)}
        </div>}
        {account.owned_systems.length > 0 ? <div className="account-settings-transfer-list">
          {account.owned_systems.map((system) => <div className="account-settings-transfer" key={system.id}>
            <strong>{system.name}</strong>
            {system.pending_transfer_id ? <>
              <p>Pedido enviado para {system.pending_target_display_name ?? 'outro membro'}. A transferência só ocorre depois da confirmação por e-mail do destinatário.</p>
              <button type="button" className="account-settings-cancel" disabled={!account.is_active || busy} onClick={() => void sendAction({ kind: 'cancel-transfer', transferId: system.pending_transfer_id! })}>Cancelar pedido</button>
            </> : system.candidates.length > 0 ? <>
              <label>Transferir para<select value={transferTargets[system.id] ?? ''} onChange={(event) => setTransferTargets({ ...transferTargets, [system.id]: event.target.value })} disabled={!account.is_active || busy}>
                <option value="">Selecione um membro</option>
                {system.candidates.map((candidate) => <option key={candidate.user_id} value={candidate.user_id}>{candidate.display_name}</option>)}
              </select></label>
              <button type="button" disabled={!account.is_active || busy || !transferTargets[system.id]} onClick={() => void requestTransfer(system.id)}>Solicitar transferência por e-mail</button>
            </> : <p>Este sistema não tem outro membro elegível para receber a titularidade.</p>}
          </div>)}
        </div> : <p className="account-settings-hint">Você não tem sistemas aguardando transferência.</p>}
      </section>

      <section className="account-settings-card account-settings-danger-zone" aria-labelledby="account-lifecycle-heading">
        <div className="account-settings-heading"><div><p className="eyebrow">AÇÕES DA CONTA</p><h2 id="account-lifecycle-heading">Desativar ou excluir</h2></div></div>
        {account.is_active && <div className="account-settings-action">
          <div><strong>Desative sua conta</strong><p>O acesso será suspenso, mas seus dados permanecerão guardados. Você poderá reativá-la pelo link enviado ao seu e-mail.</p></div>
          <button type="button" className="account-settings-danger" disabled={busy} onClick={() => void sendAction({ kind: 'deactivate' })}>Enviar confirmação</button>
        </div>}
        <div className="account-settings-action">
          <div><strong>Exclua sua conta</strong><p>A exclusão é permanente. Personagens, campanhas e dados pessoais serão removidos. Sistemas de sua propriedade precisam ser transferidos e aceitos por outro membro primeiro.</p></div>
          <label className="account-settings-delete-check">Digite EXCLUIR para solicitar a exclusão<input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off" /></label>
          <button type="button" className="account-settings-danger" disabled={busy || deleteConfirmation !== 'EXCLUIR' || account.owned_systems.length > 0} onClick={() => { setDeleteConfirmation(''); void sendAction({ kind: 'delete' }); }}>
            Enviar link para exclusão
          </button>
        </div>
      </section>
    </>}
  </main>;
}

function confirmationTitle(action: PendingAccountAction) {
  switch (action.kind) {
    case 'profile-update': return 'Aplicar alterações do perfil';
    case 'password-change': return 'Definir nova senha';
    case 'deactivate': return 'Desativar sua conta';
    case 'reactivate': return 'Reativar sua conta';
    case 'delete': return 'Excluir sua conta permanentemente';
    case 'request-transfer': return 'Solicitar transferência do sistema';
    case 'cancel-transfer': return 'Cancelar pedido de transferência';
    case 'accept-transfer': return 'Aceitar transferência de titularidade';
  }
}

function confirmationDescription(action: PendingAccountAction) {
  switch (action.kind) {
    case 'profile-update': return 'Seu e-mail foi confirmado. Revise e confirme a aplicação das alterações solicitadas.';
    case 'password-change': return 'Seu e-mail foi confirmado. Escolha uma nova senha para sua conta.';
    case 'deactivate': return 'A conta será desativada e seus dados serão preservados. Você poderá reativá-la mais tarde.';
    case 'reactivate': return 'Seu acesso e seus dados serão restaurados.';
    case 'delete': return 'Esta ação não pode ser desfeita e removerá os dados da conta. Sistemas precisam ser transferidos antes.';
    case 'request-transfer': return 'O membro escolhido receberá um pedido e precisará confirmá-lo pelo próprio e-mail.';
    case 'cancel-transfer': return 'O pedido pendente será cancelado, sem alteração da titularidade.';
    case 'accept-transfer': return 'Ao aceitar, você se tornará o titular do sistema.';
  }
}

function confirmationButton(action: PendingAccountAction) {
  switch (action.kind) {
    case 'profile-update': return 'Confirmar alterações';
    case 'password-change': return 'Atualizar senha';
    case 'deactivate': return 'Confirmar desativação';
    case 'reactivate': return 'Confirmar reativação';
    case 'delete': return 'Confirmar exclusão permanente';
    case 'request-transfer': return 'Enviar pedido de transferência';
    case 'cancel-transfer': return 'Cancelar pedido';
    case 'accept-transfer': return 'Aceitar transferência';
  }
}
