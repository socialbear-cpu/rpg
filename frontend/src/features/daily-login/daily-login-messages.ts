import type { DailyLoginClaimResult } from '../../api';

export function formatDailyLoginClaimSuccess(
  result: Pick<DailyLoginClaimResult, 'quantity' | 'item_name' | 'xp_awarded' | 'currency_awarded' | 'currency_name'>,
) {
  const quantity = result.quantity === 1 ? '1 unidade' : `${result.quantity} unidades`;
  const verb = result.quantity === 1 ? 'foi entregue' : 'foram entregues';
  const itemMessage = `${quantity} de ${result.item_name} ${verb} ao personagem.`;
  const xp = result.xp_awarded > 0 ? ` +${result.xp_awarded} XP.` : '';
  const currency = (result.currency_awarded ?? 0) > 0 ? ` +${result.currency_awarded?.toLocaleString('pt-BR')} ${result.currency_name ?? 'moedas'}.` : '';
  return `${itemMessage}${xp}${currency}`;
}
