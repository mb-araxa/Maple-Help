import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as chamados from '../app/actions/chamados';
import { Chamado } from '@/types/database';

const { mockAnalisarChamadoComIa } = vi.hoisted(() => ({
  mockAnalisarChamadoComIa: vi.fn(),
}));

vi.mock('@/lib/iaChamados', () => ({
  analisarChamadoComIa: mockAnalisarChamadoComIa,
}));

// Mocks
vi.mock('next/headers', () => ({
  headers: vi.fn(() => ({
    get: vi.fn(() => '127.0.0.1'),
  })),
  cookies: vi.fn(() => ({
    getAll: vi.fn(),
    setAll: vi.fn(),
  }))
}));

// Mock do utils
vi.mock('@/lib/utils', () => ({
  extractFirstName: vi.fn((email: string) => email.split('@')[0]),
}));

// Mock do supabase SSR
const mockSupabase = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(),
  storage: {
    from: vi.fn(() => ({
      createSignedUrl: vi.fn(() => ({ data: { signedUrl: 'mocked-signed-url' } })),
      getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'mocked-public-url' } })),
    })),
  }
};

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => mockSupabase),
}));

vi.mock('@upstash/ratelimit', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@upstash/ratelimit')>();
  return {
    ...mod,
    Ratelimit: Object.assign(
      vi.fn().mockImplementation(() => ({
        limit: vi.fn(() => Promise.resolve({ success: true })),
      })),
      { slidingWindow: vi.fn() }
    ),
  };
});

describe('Ações de Chamados (Server Actions)', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Autorização (requireAdmin)', () => {
    it('deve rejeitar se o usuário não estiver autenticado', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('Não autenticado') });
      
      await expect(chamados.obterChamadosAbertos()).rejects.toThrow('Usuário não autenticado.');
    });

    it('deve rejeitar se o usuário não for administrador', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ 
        data: { user: { id: 'u1', email: 'comum@teste.com' } },
        error: null,
      });

      mockSupabase.from.mockImplementationOnce((table: string) => {
        if (table === 'app_admins') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
              })
            })
          };
        }
        return {};
      });
      
      await expect(chamados.obterChamadosAbertos()).rejects.toThrow('Acesso negado: você não tem permissão de administrador.');
    });

    it('deve permitir se o usuário for administrador', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ 
        data: { user: { id: 'a1', email: 'admin@teste.com' } },
        error: null,
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'app_admins') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { email: 'admin@teste.com' }, error: null })
              })
            })
          };
        }
        if (table === 'chamados') {
          return {
            select: vi.fn().mockReturnValue({
              neq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [] })
              })
            })
          };
        }
        return {};
      });
      
      const result = await chamados.obterChamadosAbertos();
      expect(result).toEqual([]);
    });
  });

  describe('abrirChamado (Validação & Zod)', () => {
    it('deve rejeitar chamado sem solicitante', async () => {
      const dadosInvalidos = { solicitante: '', local: 'Sala 1', categoria: 'TI', descricao: 'O mouse parou de funcionar e preciso de um novo urgentemente.' };
      
      await expect(chamados.abrirChamado(dadosInvalidos as unknown as Chamado)).rejects.toThrow();
    });

    it('deve rejeitar chamado com descrição muito curta', async () => {
      const dadosInvalidos = { solicitante: 'João', local: 'Sala 1', categoria: 'TI', descricao: 'Curta' };
      
      await expect(chamados.abrirChamado(dadosInvalidos as unknown as Chamado)).rejects.toThrow();
    });

    it('11. solicitações comuns continuam funcionando quando a IA falha e ignora prioridade enviada pelo usuário', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({
        data: { user: { id: 'u1', email: 'colab@maplebeararaxa.com.br' } },
        error: null,
      });

      const insertSpy = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: '33333333-3333-4333-8333-333333333333',
              solicitante: 'João',
              local: 'Sala 1',
              categoria: 'Computador | Notebook',
              descricao: 'O computador não liga após queda de energia.',
              status: 'Pendente',
              prioridade: null,
            },
            error: null,
          }),
        }),
      });

      mockSupabase.from.mockImplementationOnce(() => ({
        insert: insertSpy,
      }));

      mockAnalisarChamadoComIa.mockRejectedValueOnce(new Error('Falha simulada na Groq'));

      const resultado = await chamados.abrirChamado({
        solicitante: 'João',
        local: 'Sala 1',
        categoria: 'Computador | Notebook',
        descricao: 'O computador não liga após queda de energia.',
        prioridade: 'critica',
      });

      expect(insertSpy).toHaveBeenCalledWith([
        expect.objectContaining({
          prioridade: null,
          solicitante: 'João',
        }),
      ]);
      expect(resultado.id).toBe('33333333-3333-4333-8333-333333333333');
    });

    it('13. solicitante não recebe campos internos da IA nas respostas de abrirChamado e obterMeusChamados', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({
        data: { user: { id: 'u1', email: 'colab@maplebeararaxa.com.br' } },
        error: null,
      });

      mockSupabase.from.mockImplementationOnce(() => ({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: '33333333-3333-4333-8333-333333333334',
                solicitante: 'Ana',
                local: 'Secretaria',
                categoria: 'Internet',
                descricao: 'Sem acesso à rede Wi-Fi institucional.',
                status: 'Pendente',
                resolucao: null,
                data_criacao: '2026-11-10T10:00:00.000Z',
                data_resolucao: null,
                responsavel: null,
                tempo_gasto: null,
                prioridade: null,
                prioridade_origem: 'padrao',
              },
              error: null,
            }),
          }),
        }),
      }));

      mockAnalisarChamadoComIa.mockResolvedValueOnce({
        ok: true,
        iaStatus: 'concluida',
        chamado: {
          id: '33333333-3333-4333-8333-333333333334',
          solicitante: 'Ana',
          local: 'Secretaria',
          categoria: 'Internet',
          descricao: 'Sem acesso à rede Wi-Fi institucional.',
          status: 'Pendente',
          resolucao: null,
          data_criacao: '2026-11-10T10:00:00.000Z',
          data_resolucao: null,
          responsavel: null,
          tempo_gasto: null,
          prioridade: 'alta',
          prioridade_origem: 'ia',
          sla_prazo_horas: 72,
          sla_vence_em: '2026-11-13T10:00:00.000Z',
          ia_sugestao_atendimento: 'Sugestão interna restrita à equipe de TI.',
          ia_justificativa: 'Justificativa interna restrita.',
          ia_prioridade_sugerida: 'alta',
          ia_confianca: 91,
          ia_modelo: 'qwen/qwen3.8-27b',
          ia_status: 'concluida',
          ia_execucao_id: '00000000-0000-4000-8000-000000000001',
        },
      });

      const criado = await chamados.abrirChamado({
        solicitante: 'Ana',
        local: 'Secretaria',
        categoria: 'Internet',
        descricao: 'Sem acesso à rede Wi-Fi institucional.',
      });

      // O solicitante vê sua prioridade e SLA, mas nunca os campos internos da IA
      expect(criado.prioridade).toBe('alta');
      expect(criado.sla_prazo_horas).toBe(72);
      expect(criado).not.toHaveProperty('ia_sugestao_atendimento');
      expect(criado).not.toHaveProperty('ia_justificativa');
      expect(criado).not.toHaveProperty('ia_prioridade_sugerida');
      expect(criado).not.toHaveProperty('ia_confianca');
      expect(criado).not.toHaveProperty('ia_modelo');
      expect(criado).not.toHaveProperty('ia_status');
      expect(criado).not.toHaveProperty('ia_execucao_id');
      expect(criado).not.toHaveProperty('prioridade_origem');

      // Verifica também obterMeusChamados
      mockSupabase.auth.getUser.mockResolvedValueOnce({
        data: { user: { id: 'u1', email: 'colab@maplebeararaxa.com.br' } },
        error: null,
      });

      mockSupabase.from.mockImplementationOnce(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  id: '33333333-3333-4333-8333-333333333334',
                  solicitante: 'Ana',
                  local: 'Secretaria',
                  categoria: 'Internet',
                  descricao: 'Sem acesso à rede Wi-Fi institucional.',
                  status: 'Pendente',
                  resolucao: null,
                  data_criacao: '2026-11-10T10:00:00.000Z',
                  data_resolucao: null,
                  responsavel: null,
                  tempo_gasto: null,
                  prioridade: 'alta',
                  sla_prazo_horas: 72,
                  sla_vence_em: '2026-11-13T10:00:00.000Z',
                  prioridade_origem: 'ia',
                  ia_sugestao_atendimento: 'Não deve vazar',
                  ia_justificativa: 'Não deve vazar',
                },
              ],
              error: null,
            }),
          }),
        }),
      }));

      const meusChamados = await chamados.obterMeusChamados();
      expect(meusChamados).toHaveLength(1);
      expect(meusChamados[0].prioridade).toBe('alta');
      expect(meusChamados[0]).not.toHaveProperty('ia_sugestao_atendimento');
      expect(meusChamados[0]).not.toHaveProperty('ia_justificativa');
      expect(meusChamados[0]).not.toHaveProperty('prioridade_origem');
    });
  });

  describe('Ações Administrativas (Validação UUID, Alteração Manual e IA)', () => {
    it('deletarChamado deve rejeitar ID inválido (não uuid)', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({ 
        data: { user: { id: 'a1', email: 'admin@teste.com' } },
        error: null,
      });

      mockSupabase.from.mockImplementationOnce((table: string) => {
        if (table === 'app_admins') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { email: 'admin@teste.com' }, error: null })
              })
            })
          };
        }
        return {};
      });
      
      await expect(chamados.deletarChamado('123')).rejects.toThrow();
    });

    it('alterarPrioridadeChamado marca prioridade_origem como manual e preserva sugestão original da IA em chamado_analises_ia', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({
        data: { user: { id: 'a1', email: 'admin@teste.com' } },
        error: null,
      });

      const updateSpy = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          neq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: '44444444-4444-4444-8444-444444444444',
                  status: 'Pendente',
                  prioridade: 'critica',
                  prioridade_origem: 'manual',
                },
                error: null,
              }),
            }),
          }),
        }),
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'app_admins') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { email: 'admin@teste.com' }, error: null }),
              }),
            }),
          };
        }
        if (table === 'chamados') {
          return { update: updateSpy };
        }
        if (table === 'chamado_analises_ia') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  {
                    chamado_id: '44444444-4444-4444-8444-444444444444',
                    ia_status: 'concluida',
                    ia_prioridade_sugerida: 'alta',
                    ia_sugestao_atendimento: 'Sugestão original preservada.',
                    ia_justificativa: 'Justificativa original preservada.',
                    ia_confianca: 85,
                  },
                ],
                error: null,
              }),
            }),
          };
        }
        return {};
      });

      const atualizado = await chamados.alterarPrioridadeChamado(
        '44444444-4444-4444-8444-444444444444',
        'critica'
      );

      expect(updateSpy).toHaveBeenCalledWith({
        prioridade: 'critica',
        prioridade_origem: 'manual',
      });
      expect(atualizado.prioridade).toBe('critica');
      expect(atualizado.prioridade_origem).toBe('manual');
      expect(atualizado.ia_prioridade_sugerida).toBe('alta');
      expect(atualizado.ia_sugestao_atendimento).toBe('Sugestão original preservada.');
    });

    it('14. usuário não administrador não pode gerar análise manual nem consultar análises', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({
        data: { user: { id: 'u1', email: 'comum@maplebeararaxa.com.br' } },
        error: null,
      });

      mockSupabase.from.mockImplementationOnce((table: string) => {
        if (table === 'app_admins') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          };
        }
        return {};
      });

      await expect(
        chamados.gerarSugestaoIaChamado('44444444-4444-4444-8444-444444444444')
      ).rejects.toThrow('Acesso negado: você não tem permissão de administrador.');
      expect(mockAnalisarChamadoComIa).not.toHaveBeenCalled();
    });

    it('15. administrador consegue consultar chamados abertos enriquecidos com a análise de public.chamado_analises_ia', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({
        data: { user: { id: 'a1', email: 'admin@teste.com' } },
        error: null,
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'app_admins') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { email: 'admin@teste.com' }, error: null }),
              }),
            }),
          };
        }
        if (table === 'chamados') {
          return {
            select: vi.fn().mockReturnValue({
              neq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: '55555555-5555-4555-8555-555555555555',
                      solicitante: 'Pedro',
                      local: 'Quadra',
                      categoria: 'Som',
                      descricao: 'Caixa de som sem áudio.',
                      status: 'Pendente',
                      data_criacao: '2026-11-10T10:00:00.000Z',
                      prioridade: 'media',
                      prioridade_origem: 'ia',
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'chamado_analises_ia') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  {
                    chamado_id: '55555555-5555-4555-8555-555555555555',
                    ia_status: 'concluida',
                    ia_prioridade_sugerida: 'media',
                    ia_justificativa: 'Equipamento de som com falha pontual.',
                    ia_sugestao_atendimento: 'Testar cabo P2/XLR e alimentação da caixa ativa.',
                    ia_confianca: 84,
                    ia_modelo: 'qwen/qwen3.8-27b',
                  },
                ],
                error: null,
              }),
            }),
          };
        }
        return {};
      });

      const abertos = await chamados.obterChamadosAbertos();
      expect(abertos).toHaveLength(1);
      expect(abertos[0].ia_status).toBe('concluida');
      expect(abertos[0].ia_sugestao_atendimento).toBe('Testar cabo P2/XLR e alimentação da caixa ativa.');
    });

    it('gerarSugestaoIaChamado não apresenta falha de persistência como sucesso', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({
        data: { user: { id: 'a1', email: 'admin@teste.com' } },
        error: null,
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'app_admins') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { email: 'admin@teste.com' }, error: null }),
              }),
            }),
          };
        }
        return {};
      });

      mockAnalisarChamadoComIa.mockResolvedValueOnce({
        ok: false,
        iaStatus: 'falha',
        motivo: 'erro_persistencia',
        chamado: null,
      });

      await expect(
        chamados.gerarSugestaoIaChamado('55555555-5555-4555-8555-555555555555')
      ).rejects.toThrow('Não foi possível salvar o resultado da análise.');
    });
  });

});
