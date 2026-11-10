export interface AuthCallbackState {
  recovery: { accessToken: string; refreshToken: string | null } | null;
  error: string | null;
  shouldCleanUrl: boolean;
}

export function readAuthCallback(hash: string): AuthCallbackState {
  const parameters = new URLSearchParams(hash.replace(/^#/, ''));
  const accessToken = parameters.get('access_token');
  const isRecovery = parameters.get('type') === 'recovery' && Boolean(accessToken);
  const hasError = parameters.has('error') || parameters.has('error_code');

  return {
    recovery: isRecovery ? { accessToken: accessToken!, refreshToken: parameters.get('refresh_token') } : null,
    error: hasError
      ? parameters.get('error_description') || 'O link de recuperação expirou ou não é válido. Solicite um novo link.'
      : null,
    shouldCleanUrl: isRecovery || hasError,
  };
}
