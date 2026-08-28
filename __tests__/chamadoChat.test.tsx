import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import * as chatActions from '@/app/actions/chamadoChat';
import { IndicadorNaoLidas } from '@/components/chamado-chat/IndicadorNaoLidas';
import { MensagemChat } from '@/components/chamado-chat/MensagemChat';
import { CompositorMensagem } from '@/components/chamado-chat/CompositorMensagem';
import { ChamadoChat } from '@/components/chamado-chat/ChamadoChat';
import { ChamadoMensagem } from '@/types/database';

// Mocks do Next.js
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    getAll: vi.fn(),
    setAll: vi.fn(),
  })),
}));

// Mock do supabase SSR
const mockSupabase = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(),
  channel: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnValue({}),
  })),
  removeChannel: vi.fn(),
};

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => mockSupabase),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'user-123' } } })),
    },
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue({}),
    })),
    removeChannel: vi.fn(),
  },
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

describe('Chat por Chamado - Testes de Unidade e Integração', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Validações Zod e Regras de Negócio (Server Actions)', () => {
    it('deve rejeitar mensagem vazia ou apenas com espaços', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({
        data: { user: { id: 'u1', email: 'user@maplebeararaxa.com.br' } },
        error: null,
      });

      await expect(
        chatActions.enviarMensagemDoChamado('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '   ')
      ).rejects.toThrow('A mensagem não pode estar vazia.');
    });

    it('deve rejeitar mensagem com mais de 2.000 caracteres', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({
        data: { user: { id: 'u1', email: 'user@maplebeararaxa.com.br' } },
        error: null,
      });

      const mensagemLonga = 'a'.repeat(2001);
      await expect(
        chatActions.enviarMensagemDoChamado('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', mensagemLonga)
      ).rejects.toThrow('A mensagem não pode exceder 2.000 caracteres.');
    });

    it('deve rejeitar chamadoId com formato inválido (não UUID)', async () => {
      await expect(
        chatActions.obterMensagensDoChamado('invalid-id')
      ).rejects.toThrow();
    });

    it('deve permitir solicitante enviar mensagem no próprio chamado aberto', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'u1', email: 'joao.silva@maplebeararaxa.com.br' } },
        error: null,
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'app_admins') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          };
        }
        if (table === 'chamados') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', status: 'Em Andamento', user_id: 'u1', solicitante: 'Joao Silva' },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'chamado_mensagens') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'm1',
                    chamado_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
                    autor_id: 'u1',
                    autor_nome: 'Joao',
                    autor_tipo: 'usuario',
                    mensagem: 'Olá equipe',
                    created_at: new Date().toISOString(),
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'chamado_chat_leituras') {
          return {
            upsert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      });

      const res = await chatActions.enviarMensagemDoChamado(
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'Olá equipe'
      );

      expect(res.mensagem).toBe('Olá equipe');
      expect(res.autor_tipo).toBe('usuario');
    });

    it('deve bloquear envio de mensagem em chamado de outro usuário', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'u_intruso', email: 'intruso@maplebeararaxa.com.br' } },
        error: null,
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'app_admins') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          };
        }
        if (table === 'chamados') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', status: 'Em Andamento', user_id: 'u_dono', solicitante: 'Dono' },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      await expect(
        chatActions.enviarMensagemDoChamado('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Teste')
      ).rejects.toThrow('Acesso negado a este chamado.');
    });

    it('deve bloquear envio de mensagem quando chamado estiver Concluído (para ambos)', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'u1', email: 'user@maplebeararaxa.com.br' } },
        error: null,
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'app_admins') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          };
        }
        if (table === 'chamados') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', status: 'Concluído', user_id: 'u1', solicitante: 'User' },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      await expect(
        chatActions.enviarMensagemDoChamado('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Tentativa após conclusão')
      ).rejects.toThrow('Este atendimento foi concluído. Não é possível enviar novas mensagens.');
    });

    it('deve permitir que o administrador acerte autor_tipo como ti ao enviar', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'admin-id', email: 'admin@maplebeararaxa.com.br' } },
        error: null,
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'app_admins') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { email: 'admin@maplebeararaxa.com.br' }, error: null }),
              }),
            }),
          };
        }
        if (table === 'chamados') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', status: 'Em Andamento', user_id: 'outro_user', solicitante: 'Outro' },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'chamado_mensagens') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'm-ti',
                    chamado_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
                    autor_id: 'admin-id',
                    autor_nome: 'Equipe de TI',
                    autor_tipo: 'ti',
                    mensagem: 'Em atendimento',
                    created_at: new Date().toISOString(),
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'chamado_chat_leituras') {
          return {
            upsert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      });

      const res = await chatActions.enviarMensagemDoChamado(
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'Em atendimento'
      );

      expect(res.autor_tipo).toBe('ti');
      expect(res.autor_nome).toBe('Equipe de TI');
    });
  });

  describe('2. Componente IndicadorNaoLidas', () => {
    it('não deve renderizar quando o contador for 0 ou negativo', () => {
      const { container } = render(<IndicadorNaoLidas count={0} />);
      expect(container.firstChild).toBeNull();
    });

    it('deve renderizar o número exato quando positivo', () => {
      render(<IndicadorNaoLidas count={3} />);
      expect(screen.getByText('3')).toBeDefined();
    });

    it('deve renderizar 99+ quando o contador for maior que 99', () => {
      render(<IndicadorNaoLidas count={150} />);
      expect(screen.getByText('99+')).toBeDefined();
    });
  });

  describe('3. Componente MensagemChat', () => {
    const mensagemExemplo: ChamadoMensagem = {
      id: 'msg-1',
      chamado_id: 'chamado-1',
      autor_id: 'user-1',
      autor_nome: 'Carlos Santos',
      autor_tipo: 'usuario',
      mensagem: 'Preciso de suporte no computador.',
      created_at: '2026-08-28T14:30:00Z',
    };

    it('deve renderizar mensagem própria com identificação "Você"', () => {
      render(<MensagemChat mensagem={mensagemExemplo} isPropria={true} />);
      expect(screen.getByText('Você')).toBeDefined();
      expect(screen.getByText('Preciso de suporte no computador.')).toBeDefined();
    });

    it('deve renderizar mensagem recebida com badge de TI quando autor_tipo for ti', () => {
      const msgTI: ChamadoMensagem = {
        ...mensagemExemplo,
        autor_id: 'admin-1',
        autor_nome: 'Equipe de TI',
        autor_tipo: 'ti',
        mensagem: 'O técnico já está a caminho.',
      };

      render(<MensagemChat mensagem={msgTI} isPropria={false} />);
      expect(screen.getByText('Equipe de TI')).toBeDefined();
      expect(screen.getByText('TI')).toBeDefined();
      expect(screen.getByText('O técnico já está a caminho.')).toBeDefined();
    });

    it('deve renderizar estado de erro e chamar onRetry ao clicar em tentar novamente', () => {
      const onRetry = vi.fn();
      render(
        <MensagemChat
          mensagem={mensagemExemplo}
          isPropria={true}
          statusEnvio="error"
          onRetry={onRetry}
        />
      );

      expect(screen.getByText('Falha no envio')).toBeDefined();
      const retryBtn = screen.getByText('Tentar novamente');
      fireEvent.click(retryBtn);
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('4. Componente CompositorMensagem', () => {
    it('deve disparar onEnviar com Enter (sem Shift)', async () => {
      const onEnviar = vi.fn().mockResolvedValue(undefined);
      render(<CompositorMensagem onEnviar={onEnviar} isSending={false} />);

      const textarea = screen.getByRole('textbox', { name: /campo de mensagem/i });
      fireEvent.change(textarea, { target: { value: 'Mensagem de teste' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

      await waitFor(() => {
        expect(onEnviar).toHaveBeenCalledWith('Mensagem de teste');
      });
    });

    it('não deve disparar onEnviar com Shift+Enter', () => {
      const onEnviar = vi.fn();
      render(<CompositorMensagem onEnviar={onEnviar} isSending={false} />);

      const textarea = screen.getByRole('textbox', { name: /campo de mensagem/i });
      fireEvent.change(textarea, { target: { value: 'Linha 1' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

      expect(onEnviar).not.toHaveBeenCalled();
    });

    it('deve renderizar aviso de atendimento concluído quando isConcluido for true', () => {
      render(<CompositorMensagem onEnviar={vi.fn()} isSending={false} isConcluido={true} />);

      expect(
        screen.getByText(/Este atendimento foi concluído\. A conversa está disponível apenas para consulta\./i)
      ).toBeDefined();
      expect(screen.queryByRole('textbox')).toBeNull();
    });
  });

  describe('5. Componente ChamadoChat', () => {
    it('deve exibir estado vazio quando não houver mensagens', async () => {
      vi.spyOn(chatActions, 'obterMensagensDoChamado').mockResolvedValueOnce({
        mensagens: [],
        hasMore: false,
      });
      vi.spyOn(chatActions, 'marcarChatComoLido').mockResolvedValueOnce({ success: true });

      render(
        <ChamadoChat
          chamadoId="a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
          status="Em Andamento"
          isAdm={false}
          currentUserId="user-123"
        />
      );

      await waitFor(() => {
        expect(
          screen.getByText(/Converse com a equipe de TI para acompanhar o andamento deste chamado\./i)
        ).toBeDefined();
      });
    });
  });
});
