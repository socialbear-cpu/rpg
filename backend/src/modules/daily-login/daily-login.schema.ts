import { z } from 'zod';

export const dailyLoginClaimSchema = z.strictObject({
  character_id: z.uuid(),
});

export const dailyLoginRewardSchema = z.strictObject({
  weekday: z.number().int().min(1).max(7),
  item_id: z.uuid(),
  quantity: z.number().int().min(1).max(1_000_000),
});

export const dailyLoginScheduleSchema = z.strictObject({
  rewards: z.array(dailyLoginRewardSchema).length(7)
    .refine((rewards) => new Set(rewards.map((reward) => reward.weekday)).size === 7,
      'Each weekday must be configured exactly once'),
  is_active: z.boolean(),
});

export type DailyLoginClaimInput = z.infer<typeof dailyLoginClaimSchema>;
export type DailyLoginRewardInput = z.infer<typeof dailyLoginRewardSchema>;
export type DailyLoginScheduleInput = z.infer<typeof dailyLoginScheduleSchema>;

export interface DailyLoginSystem {
  id: string;
  name: string;
  is_active: boolean;
  daily_login_timezone: string;
  daily_login_rewards_enabled: boolean;
}

export interface DailyLoginCharacter {
  id: string;
  character_name: string;
  game_system_id: string;
}

export interface DailyLoginReward {
  weekday: number;
  item_id: string;
  item_name: string;
  quantity: number;
}

export interface DailyLoginClaim {
  id: string;
  character_id: string;
  item_id: string;
  item_name_snapshot: string;
  quantity: number;
  weekday: number;
  local_claim_date: string;
  claimed_at: string;
}

export interface DailyLoginTodayState {
  status: 'available' | 'already_claimed' | 'calendar_unavailable' | 'system_unavailable' | 'unauthorized';
  weekday?: number;
  local_date?: string;
  timezone?: string;
  reward?: DailyLoginReward | null;
  claim?: DailyLoginClaim | null;
}

export interface DailyLoginSystemState {
  system: DailyLoginSystem;
  characters: DailyLoginCharacter[];
  today: DailyLoginTodayState;
}
