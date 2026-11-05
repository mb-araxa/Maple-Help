import type { Chamado } from '@/types/database';

export const PRIORIDADES = ['baixa', 'media', 'alta', 'critica'] as const;
export type Prioridade = typeof PRIORIDADES[number];
export const PRIORIDADE_LABEL: Record<Prioridade, string> = {
  baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica',
};
export interface PoliticaSla { prioridade: Prioridade; prazo_horas: number | null }
export type SituacaoSla = 'sem_sla' | 'no_prazo' | 'proximo' | 'atrasado' | 'cumprido' | 'violado';
export const SITUACAO_SLA_LABEL: Record<SituacaoSla, string> = {
  sem_sla: 'Sem SLA registrado', no_prazo: 'Dentro do prazo', proximo: 'Próximo do vencimento',
  atrasado: 'SLA atrasado', cumprido: 'SLA cumprido', violado: 'Resolvido fora do SLA',
};

export function situacaoSla(chamado: Chamado, agora = Date.now()): SituacaoSla {
  const limite = Date.parse(chamado.sla_vence_em || '');
  if (!Number.isFinite(limite) || !chamado.sla_prazo_horas) return 'sem_sla';
  if (chamado.status === 'Concluído') {
    const resolvido = Date.parse(chamado.data_resolucao || '');
    if (!Number.isFinite(resolvido)) return 'sem_sla';
    return resolvido <= limite ? 'cumprido' : 'violado';
  }
  if (agora > limite) return 'atrasado';
  // Alerta nos últimos 20% do prazo contratado, inclusive no instante do vencimento.
  return limite - agora <= chamado.sla_prazo_horas * 3_600_000 * 0.2 ? 'proximo' : 'no_prazo';
}

export function resumirSla(chamados: Chamado[]) {
  const concluidos = chamados.filter(c => c.status === 'Concluído');
  const cumpridos = concluidos.filter(c => situacaoSla(c) === 'cumprido').length;
  const violados = concluidos.filter(c => situacaoSla(c) === 'violado').length;
  const avaliados = cumpridos + violados;
  return { cumpridos, violados, semSla: concluidos.length - avaliados,
    percentual: avaliados ? (cumpridos / avaliados) * 100 : null };
}
