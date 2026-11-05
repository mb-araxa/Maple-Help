import { describe, it, expect } from 'vitest';
import { resumirSla, situacaoSla } from '@/lib/sla';
import { prioridadeDoAssunto, emailEntradaSchema } from '@/lib/emailEntrada';
import type { Chamado } from '@/types/database';

const chamado: Chamado = {
  id: '1', solicitante: 'Pessoa', local: 'Sala', categoria: 'TI', descricao: 'Descrição',
  status: 'Pendente', data_criacao: '2026-10-09T21:00:00Z', data_resolucao: null,
  resolucao: null, responsavel: null, tempo_gasto: null,
  prioridade: 'alta', sla_prazo_horas: 24, sla_vence_em: '2026-10-10T21:00:00Z',
};

describe('SLA de resolução em horas corridas', () => {
  it('inclui a noite e o sábado, e alerta nos últimos 20%', () => {
    expect(situacaoSla(chamado, Date.parse('2026-10-10T08:00:00Z'))).toBe('no_prazo');
    expect(situacaoSla(chamado, Date.parse('2026-10-10T20:00:00Z'))).toBe('proximo');
    expect(situacaoSla(chamado, Date.parse('2026-10-10T21:00:00.001Z'))).toBe('atrasado');
  });
  it('considera conclusão no instante do limite como cumprida e congela o resultado', () => {
    const fechado = { ...chamado, status: 'Concluído', data_resolucao: chamado.sla_vence_em! };
    expect(situacaoSla(fechado, Date.parse('2030-01-01'))).toBe('cumprido');
    expect(situacaoSla({ ...fechado, data_resolucao: '2026-10-10T21:00:00.001Z' })).toBe('violado');
  });
  it('não conta registros antigos ou incompletos como cumpridos', () => {
    const fechado = { ...chamado, status: 'Concluído', data_resolucao: chamado.sla_vence_em! };
    expect(resumirSla([fechado, { ...fechado, data_resolucao: '2026-10-11T21:00:00Z' },
      { ...fechado, sla_vence_em: null }, { ...fechado, data_resolucao: null }, chamado]))
      .toEqual({ cumpridos: 1, violados: 1, semSla: 2, percentual: 50 });
    expect(resumirSla([]).percentual).toBeNull();
  });
});

describe('Prioridade de e-mails', () => {
  it.each([['[BAIXA] Mouse', 'baixa'], ['[MÉDIA] Tela', 'media'], ['[ALTA] Internet', 'alta'],
    ['[CRÍTICA] Sistema parado', 'critica'], ['Sem marcador, urgente!', 'media']])('%s → %s', (assunto, prioridade) => {
    expect(prioridadeDoAssunto(assunto)).toBe(prioridade);
  });
  it('recusa prioridades conflitantes e não infere por palavras soltas', () => {
    expect(() => prioridadeDoAssunto('[ALTA] [BAIXA] Teste')).toThrow('apenas um');
    expect(prioridadeDoAssunto('CRITICA: qualquer texto')).toBe('media');
  });
  it('recusa remetente externo, base64 inválido e campos fora do limite', () => {
    const dados = { messageId: 'abc123', mailbox: 'help@gmail.com', remetente: 'pessoa@externo.com', nome: 'Pessoa',
      assunto: 'Teste', texto: 'Detalhes', dataEmail: '2026-10-14T12:00:00.000Z', originalBase64: 'YWJj' };
    expect(emailEntradaSchema.safeParse(dados).success).toBe(false);
    expect(emailEntradaSchema.safeParse({ ...dados, remetente: 'pessoa@maplebeararaxa.com.br', originalBase64: '!abc' }).success).toBe(false);
  });
});
