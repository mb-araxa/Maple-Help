import { z } from 'zod';
import type { Prioridade } from '@/lib/sla';

export const MAX_EMAIL_REQUEST_BYTES = 3_500_000;
export const emailEntradaSchema = z.object({
  messageId: z.string().regex(/^[a-f0-9]{1,64}$/i),
  mailbox: z.email().max(254).transform(v => v.toLowerCase()),
  remetente: z.email().max(254).transform(v => v.toLowerCase()).refine(v => v.endsWith('@maplebeararaxa.com.br')),
  nome: z.string().trim().max(200),
  assunto: z.string().max(1000),
  texto: z.string().max(200_000),
  dataEmail: z.iso.datetime(),
  originalBase64: z.string().min(4).max(3_333_336).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
});

export function prioridadeDoAssunto(assunto: string): Prioridade {
  const normalizado = assunto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const marcadores = [...normalizado.matchAll(/\[(baixa|media|alta|critica)\]/g)].map(m => m[1] as Prioridade);
  if (new Set(marcadores).size > 1) throw new Error('Use apenas um marcador de prioridade no assunto.');
  return marcadores[0] || 'media';
}
