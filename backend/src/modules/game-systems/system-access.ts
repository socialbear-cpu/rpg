import type { FastifyReply } from 'fastify';
import type { z } from 'zod';
import type { joinGameSystemResultSchema } from './game-systems.schema.js';

type SystemAccessStatus = z.infer<typeof joinGameSystemResultSchema>['status'];

export function rejectSystemAccess(reply: FastifyReply, status: SystemAccessStatus): FastifyReply | null {
  switch (status) {
    case 'ok': return null;
    case 'unauthorized': return reply.code(401).send({ error: 'Unauthorized' });
    case 'not_found': return reply.code(404).send({ error: 'Game system not found' });
    case 'rate_limited': return reply.code(429).send({ error: 'Muitas tentativas incorretas. Tente novamente em uma hora.' });
    case 'password_required': return reply.code(403).send({ error: 'Este sistema exige uma senha de acesso.' });
    case 'invalid_password': return reply.code(403).send({ error: 'A senha do sistema está incorreta.' });
  }
}
