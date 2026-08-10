import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as chamados from '../app/actions/chamados';

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
const mockAdminEmails = ['admin@teste.com'];
vi.mock('@/lib/utils', () => ({
  extractFirstName: vi.fn((email) => email.split('@')[0]),
  getAdminEmails: vi.fn(() => mockAdminEmails),
  isAdminEmail: vi.fn((email) => mockAdminEmails.includes(email)),
}));

// Mock do supabase SSR
const mockSupabase = {
  auth: {
    getSession: vi.fn(),
  },
  from: vi.fn(),
  storage: {
    from: vi.fn(() => ({
      createSignedUrl: vi.fn(() => ({ data: { signedUrl: 'mocked-signed-url' } })),
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
      mockSupabase.auth.getSession.mockResolvedValueOnce({ data: { session: null } });
      
      await expect(chamados.obterChamadosAbertos()).rejects.toThrow('Usuário não autenticado.');
    });

    it('deve rejeitar se o usuário não for administrador', async () => {
      mockSupabase.auth.getSession.mockResolvedValueOnce({ 
        data: { session: { user: { email: 'comum@teste.com' } } } 
      });
      
      await expect(chamados.obterChamadosAbertos()).rejects.toThrow('Acesso negado: você não tem permissão de administrador.');
    });

    it('deve permitir se o usuário for administrador', async () => {
      mockSupabase.auth.getSession.mockResolvedValueOnce({ 
        data: { session: { user: { email: 'admin@teste.com' } } } 
      });

      const mockSelect = vi.fn().mockReturnValue({ neq: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [] }) }) });
      mockSupabase.from.mockReturnValueOnce({ select: mockSelect });
      
      const result = await chamados.obterChamadosAbertos();
      expect(result).toEqual([]);
    });
  });

  describe('abrirChamado (Validação & Zod)', () => {
    it('deve rejeitar chamado sem solicitante', async () => {
      const dadosInvalidos = { solicitante: '', local: 'Sala 1', categoria: 'TI', descricao: 'O mouse parou de funcionar e preciso de um novo urgentemente.' };
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(chamados.abrirChamado(dadosInvalidos as any)).rejects.toThrow();
    });

    it('deve rejeitar chamado com descrição muito curta', async () => {
      const dadosInvalidos = { solicitante: 'João', local: 'Sala 1', categoria: 'TI', descricao: 'Curta' };
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(chamados.abrirChamado(dadosInvalidos as any)).rejects.toThrow();
    });
  });

  describe('Ações de Escrita (Validação UUID)', () => {
    it('deletarChamado deve rejeitar ID inválido (não uuid)', async () => {
      mockSupabase.auth.getSession.mockResolvedValueOnce({ 
        data: { session: { user: { email: 'admin@teste.com' } } } 
      });
      
      await expect(chamados.deletarChamado('123')).rejects.toThrow();
    });
  });

});
