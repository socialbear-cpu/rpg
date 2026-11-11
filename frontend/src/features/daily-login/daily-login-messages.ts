import type { DailyLoginClaimResult } from '../../api';

export function formatDailyLoginClaimSuccess(
  result: Pick<DailyLoginClaimResult, 'quantity' | 'item_name' | 'xp_awarded'>,
) {
  const quantity = result.quantity === 1 ? '1 unidade' : `${result.quantity} unidades`;
  const verb = result.quantity === 1 ? 'foi entregue' : 'foram entregues';
  const itemMessage = `${quantity} de ${result.item_name} ${verb} ao personagem.`;
  return result.xp_awarded > 0 ? `${itemMessage} +${result.xp_awarded} XP.` : itemMessage;
}
