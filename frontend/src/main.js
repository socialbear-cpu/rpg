import { validateConfig } from './config.js';
import { checkHealth, getMyProfile, updateMyProfile } from './api.js';
import { hasSession, isPasswordRecovery, passwordRecoveryError, requestPasswordReset, signIn, signOut, signUp, updatePassword } from './supabase-auth.js';

const $ = (selector) => document.querySelector(selector);
const notice = $('#notice');
let mode = 'login';

function showNotice(message, isError = false) {
  notice.textContent = message;
  notice.classList.toggle('error', isError);
  notice.hidden = false;
}

function clearNotice() { notice.hidden = true; }

function setBusy(button, busy, label) {
  button.disabled = busy;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = label;
  } else if (button.dataset.label) {
    button.textContent = button.dataset.label;
    delete button.dataset.label;
  }
}

function setMode(nextMode) {
  mode = nextMode;
  const signup = mode === 'signup';
  $('#tab-login').classList.toggle('active', !signup);
  $('#tab-login').setAttribute('aria-selected', String(!signup));
  $('#tab-signup').classList.toggle('active', signup);
  $('#tab-signup').setAttribute('aria-selected', String(signup));
  $('#name-field').hidden = !signup;
  $('#display-name').required = signup;
  $('#password').autocomplete = signup ? 'new-password' : 'current-password';
  $('#auth-submit').textContent = signup ? 'Criar conta' : 'Entrar';
  $('#reset-password').hidden = signup;
  clearNotice();
}

function updateSessionUI() {
  const authenticated = hasSession();
  $('#session-state').textContent = authenticated ? 'Autenticado nesta sessão' : 'Não autenticado';
  $('#logout').disabled = !authenticated;
  for (const selector of ['#profile-name', '#profile-avatar', '#profile-bio', '#load-profile', '#save-profile']) {
    $(selector).disabled = !authenticated;
  }
}

function fillProfile(profile) {
  $('#profile-name').value = profile.display_name ?? '';
  $('#profile-avatar').value = profile.avatar_url ?? '';
  $('#profile-bio').value = profile.bio ?? '';
}

async function initialize() {
  const missing = validateConfig();
  if (missing.length) {
    showNotice(`Configure frontend/config.js com ${missing.join(' e ')} para habilitar cadastro e login.`, true);
  }
  try {
    await checkHealth();
    $('#health-dot').classList.add('ok');
    $('#health-text').textContent = 'API disponível';
  } catch {
    $('#health-dot').classList.add('bad');
    $('#health-text').textContent = 'API indisponível';
  }
  updateSessionUI();
  if (isPasswordRecovery) {
    $('#auth-form').hidden = true;
    $('.tabs').hidden = true;
    $('#reset-password').hidden = true;
    $('#password-recovery-form').hidden = false;
  } else if (passwordRecoveryError) {
    showNotice(`${passwordRecoveryError} Informe seu e-mail e solicite outro link.`, true);
  }
}

document.querySelectorAll('[data-mode]').forEach((tab) => tab.addEventListener('click', () => setMode(tab.dataset.mode)));

$('#auth-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearNotice();
  const button = $('#auth-submit');
  setBusy(button, true, mode === 'signup' ? 'Criando…' : 'Entrando…');
  try {
    const email = $('#email').value.trim();
    const password = $('#password').value;
    if (mode === 'signup') {
      const result = await signUp({ email, password, displayName: $('#display-name').value.trim() });
      if (result.access_token) {
        showNotice('Conta criada e sessão iniciada. Agora carregue seu perfil.');
      } else {
        showNotice('Cadastro recebido. Confirme seu e-mail para poder entrar.');
      }
    } else {
      await signIn({ email, password });
      showNotice('Login realizado. Carregue seu perfil para validar a API.');
    }
    updateSessionUI();
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    setBusy(button, false);
  }
});

$('#password-recovery-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await updatePassword($('#new-password').value);
    $('#password-recovery-form').hidden = true;
    $('#auth-form').hidden = false;
    $('.tabs').hidden = false;
    setMode('login');
    showNotice('Senha atualizada. Entre com a nova senha.');
    updateSessionUI();
  } catch (error) { showNotice(error.message, true); }
});

$('#logout').addEventListener('click', async () => {
  try { await signOut(); showNotice('Sessão encerrada.'); }
  catch (error) { showNotice(error.message, true); }
  updateSessionUI();
});

$('#reset-password').addEventListener('click', async () => {
  const email = $('#email').value.trim();
  if (!email) { showNotice('Informe seu e-mail antes de solicitar a recuperação.', true); return; }
  try {
    await requestPasswordReset(email);
    showNotice('Se o e-mail estiver cadastrado, você receberá as instruções de recuperação.');
  } catch (error) { showNotice(error.message, true); }
});

$('#load-profile').addEventListener('click', async () => {
  try { fillProfile(await getMyProfile()); showNotice('Perfil carregado pela API.'); }
  catch (error) { showNotice(error.message, true); }
});

$('#profile-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#save-profile');
  setBusy(button, true, 'Salvando…');
  try {
    const updated = await updateMyProfile({
      display_name: $('#profile-name').value,
      avatar_url: $('#profile-avatar').value.trim() || null,
      bio: $('#profile-bio').value || null,
    });
    fillProfile(updated);
    showNotice('Perfil atualizado pela API.');
  } catch (error) { showNotice(error.message, true); }
  finally { setBusy(button, false); }
});

initialize();
