import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as chamados from '../app/actions/chamados';
import { Chamado } from '@/types/database';

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
  });

  describe('Ações de Escrita (Validação UUID)', () => {
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
  });

});
