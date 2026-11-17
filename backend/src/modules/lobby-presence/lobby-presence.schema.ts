import { z } from 'zod';

export const lobbyPresenceParamsSchema = z.strictObject({ systemId: z.uuid() });
export const lobbyPresenceCountSchema = z.number().int().nonnegative();
