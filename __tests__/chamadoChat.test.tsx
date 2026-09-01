import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React, { useState } from 'react';
import * as chatActions from '@/app/actions/chamadoChat';
import { IndicadorNaoLidas } from '@/components/chamado-chat/IndicadorNaoLidas';
import { MensagemChat } from '@/components/chamado-chat/MensagemChat';
import { CompositorMensagem } from '@/components/chamado-chat/CompositorMensagem';
import { ChamadoChat } from '@/components/chamado-chat/ChamadoChat';
import { ChamadoMensagem } from '@/types/database';
import { supabase } from '@/lib/supabase';

// Mocks do Next.js
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    getAll: vi.fn(),
    setAll: vi.fn(),
  })),
}));

// Mock do supabase SSR
const mockSupabaseSSR = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(),
};

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => mockSupabaseSSR),
}));

// Controladores para simulação de Realtime
type RealtimeEventHandler = (payload: { new: unknown; [key: string]: unknown }) => void;
type RealtimeStatusHandler = (status: string) => void;

let realtimeEventHandlers: RealtimeEventHandler[] = [];
let realtimeStatusHandlers: RealtimeStatusHandler[] = [];
const mockRemoveChannel = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'user-123' } } })),
    },
    channel: vi.fn(() => ({
      on: vi.fn((_type: string, _filter: unknown, handler: RealtimeEventHandler) => {
        realtimeEventHandlers.push(handler);
        return {
          subscribe: vi.fn((statusHandler?: RealtimeStatusHandler) => {
            if (statusHandler) realtimeStatusHandlers.push(statusHandler);
            return {};
          }),
        };
      }),
    })),
    removeChannel: vi.fn((...args) => mockRemoveChannel(...args)),
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

function createChainableMock(resolvedData: unknown, resolvedError: unknown = null) {
  const chain: Record<string, unknown> = {};
  const returnChain = vi.fn(() => chain);
  chain.select = returnChain;
  chain.eq = returnChain;
  chain.or = returnChain;
  chain.in = returnChain;
  chain.order = returnChain;
  chain.limit = vi.fn(() => Promise.resolve({ data: resolvedData, error: resolvedError }));
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: resolvedData, error: resolvedError }));
  chain.single = vi.fn(() => Promise.resolve({ data: resolvedData, error: resolvedError }));
  chain.insert = returnChain;
  chain.upsert = vi.fn(() => Promise.resolve({ data: resolvedData, error: resolvedError }));
  return chain;
}

describe('Chat por Chamado - Testes de Unidade e Integração', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    realtimeEventHandlers = [];
    realtimeStatusHandlers = [];
  });

  describe('1. Validações Zod e Regras de Negócio (Server Actions)', () => {
    it('deve rejeitar mensagem vazia ou apenas com espaços', async () => {
      mockSupabaseSSR.auth.getUser.mockResolvedValueOnce({
        data: { user: { id: 'u1', email: 'user@maplebeararaxa.com.br' } },
        error: null,
      });

      await expect(
        chatActions.enviarMensagemDoChamado('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', '   ')
      ).rejects.toThrow('A mensagem não pode estar vazia.');
    });

    it('deve rejeitar mensagem com mais de 2.000 caracteres', async () => {
      mockSupabaseSSR.auth.getUser.mockResolvedValueOnce({
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
      mockSupabaseSSR.auth.getUser.mockResolvedValue({
        data: { user: { id: 'u1', email: 'joao.silva@maplebeararaxa.com.br' } },
        error: null,
      });

      mockSupabaseSSR.from.mockImplementation((table: string) => {
        if (table === 'app_admins') {
          return createChainableMock(null);
        }
        if (table === 'chamados') {
          return createChainableMock({
            id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            status: 'Em Andamento',
            user_id: 'u1',
            solicitante: 'Joao Silva',
          });
        }
        if (table === 'chamado_mensagens') {
          return createChainableMock({
            id: 'm1',
            chamado_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            autor_id: 'u1',
            autor_nome: 'Joao',
            autor_tipo: 'usuario',
            mensagem: 'Olá equipe',
            created_at: new Date().toISOString(),
          });
        }
        if (table === 'chamado_chat_leituras') {
          return createChainableMock(null);
        }
        return createChainableMock(null);
      });

      const res = await chatActions.enviarMensagemDoChamado(
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'Olá equipe'
      );

      expect(res.mensagem).toBe('Olá equipe');
      expect(res.autor_tipo).toBe('usuario');
    });

    it('deve bloquear envio de mensagem em chamado de outro usuário', async () => {
      mockSupabaseSSR.auth.getUser.mockResolvedValue({
        data: { user: { id: 'u_intruso', email: 'intruso@maplebeararaxa.com.br' } },
        error: null,
      });

      mockSupabaseSSR.from.mockImplementation((table: string) => {
        if (table === 'app_admins') {
          return createChainableMock(null);
        }
        if (table === 'chamados') {
          return createChainableMock({
            id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            status: 'Em Andamento',
            user_id: 'u_dono',
            solicitante: 'Dono',
          });
        }
        return createChainableMock(null);
      });

      await expect(
        chatActions.enviarMensagemDoChamado('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Teste')
      ).rejects.toThrow('Acesso negado a este chamado.');
    });

    it('deve bloquear envio de mensagem quando chamado estiver Concluído (para ambos)', async () => {
      mockSupabaseSSR.auth.getUser.mockResolvedValue({
        data: { user: { id: 'u1', email: 'user@maplebeararaxa.com.br' } },
        error: null,
      });

      mockSupabaseSSR.from.mockImplementation((table: string) => {
        if (table === 'app_admins') {
          return createChainableMock(null);
        }
        if (table === 'chamados') {
          return createChainableMock({
            id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            status: 'Concluído',
            user_id: 'u1',
            solicitante: 'User',
          });
        }
        return createChainableMock(null);
      });

      await expect(
        chatActions.enviarMensagemDoChamado('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Tentativa após conclusão')
      ).rejects.toThrow('Este atendimento foi concluído. Não é possível enviar novas mensagens.');
    });

    it('deve permitir que o administrador envie com autor_tipo ti', async () => {
      mockSupabaseSSR.auth.getUser.mockResolvedValue({
        data: { user: { id: 'admin-id', email: 'admin@maplebeararaxa.com.br' } },
        error: null,
      });

      mockSupabaseSSR.from.mockImplementation((table: string) => {
        if (table === 'app_admins') {
          return createChainableMock({ email: 'admin@maplebeararaxa.com.br' });
        }
        if (table === 'chamados') {
          return createChainableMock({
            id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            status: 'Em Andamento',
            user_id: 'outro_user',
            solicitante: 'Outro',
          });
        }
        if (table === 'chamado_mensagens') {
          return createChainableMock({
            id: 'm-ti',
            chamado_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            autor_id: 'admin-id',
            autor_nome: 'Equipe de TI',
            autor_tipo: 'ti',
            mensagem: 'Em atendimento',
            created_at: new Date().toISOString(),
          });
        }
        if (table === 'chamado_chat_leituras') {
          return createChainableMock(null);
        }
        return createChainableMock(null);
      });

      const res = await chatActions.enviarMensagemDoChamado(
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        'Em atendimento'
      );

      expect(res.autor_tipo).toBe('ti');
      expect(res.autor_nome).toBe('Equipe de TI');
    });

    it('não confirma leitura quando a tabela de leituras não existe', async () => {
      mockSupabaseSSR.auth.getUser.mockResolvedValue({
        data: { user: { id: 'u1', email: 'user@maplebeararaxa.com.br' } },
        error: null,
      });

      const latestMessageQuery = createChainableMock({
        created_at: '2026-08-30T12:00:00Z',
      });
      (latestMessageQuery.limit as ReturnType<typeof vi.fn>).mockReturnValue(latestMessageQuery);

      mockSupabaseSSR.from.mockImplementation((table: string) => {
        if (table === 'app_admins') {
          return createChainableMock(null);
        }
        if (table === 'chamados') {
          return createChainableMock({
            id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            user_id: 'u1',
          });
        }
        if (table === 'chamado_mensagens') {
          return latestMessageQuery;
        }
        if (table === 'chamado_chat_leituras') {
          return createChainableMock(null, { code: '42P01', message: 'relation does not exist' });
        }
        return createChainableMock(null);
      });

      vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const result = await chatActions.marcarChatComoLido(
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
      );

      expect(result).toEqual({ success: false });
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

    it('deve exibir o nome do responsável quando autor_tipo for ti e responsavel estiver preenchido', () => {
      const msgTI: ChamadoMensagem = {
        ...mensagemExemplo,
        autor_id: 'admin-1',
        autor_nome: 'Equipe de TI',
        autor_tipo: 'ti',
        mensagem: 'Olá, irei resolver seu problema.',
      };

      render(<MensagemChat mensagem={msgTI} isPropria={false} responsavel="Isaque" />);
      expect(screen.getByText('Isaque')).toBeDefined();
      expect(screen.getByText('TI')).toBeDefined();
      expect(screen.queryByText('Equipe de TI')).toBeNull();
      expect(screen.getByText('Olá, irei resolver seu problema.')).toBeDefined();
    });

    it('deve usar o responsável atual mesmo em mensagens antigas com autor_nome = "Equipe de TI"', () => {
      const msgAntigaTI: ChamadoMensagem = {
        ...mensagemExemplo,
        autor_id: 'admin-1',
        autor_nome: 'Equipe de TI',
        autor_tipo: 'ti',
        mensagem: 'Mensagem antiga enviada pela TI.',
      };

      render(<MensagemChat mensagem={msgAntigaTI} isPropria={false} responsavel="Pedro" />);
      expect(screen.getByText('Pedro')).toBeDefined();
      expect(screen.queryByText('Equipe de TI')).toBeNull();
    });

    it('deve exibir "Equipe de TI" como fallback quando responsavel for indefinido ou nulo', () => {
      const msgTI: ChamadoMensagem = {
        ...mensagemExemplo,
        autor_id: 'admin-1',
        autor_nome: 'Equipe de TI',
        autor_tipo: 'ti',
        mensagem: 'Mensagem sem responsável definido.',
      };

      render(<MensagemChat mensagem={msgTI} isPropria={false} responsavel={null} />);
      expect(screen.getByText('Equipe de TI')).toBeDefined();
      expect(screen.getByText('TI')).toBeDefined();
    });

    it('deve usar fallback "Equipe de TI" quando responsavel contiver apenas espaços', () => {
      const msgTI: ChamadoMensagem = {
        ...mensagemExemplo,
        autor_id: 'admin-1',
        autor_nome: 'Equipe de TI',
        autor_tipo: 'ti',
        mensagem: 'Mensagem com responsável vazio.',
      };

      render(<MensagemChat mensagem={msgTI} isPropria={false} responsavel="   " />);
      expect(screen.getByText('Equipe de TI')).toBeDefined();
      expect(screen.getByText('TI')).toBeDefined();
    });

    it('deve exibir "Você" quando a mensagem for própria mesmo que responsavel esteja definido', () => {
      const msgTIPropria: ChamadoMensagem = {
        ...mensagemExemplo,
        autor_id: 'admin-1',
        autor_nome: 'Equipe de TI',
        autor_tipo: 'ti',
        mensagem: 'Minha própria mensagem de TI.',
      };

      render(<MensagemChat mensagem={msgTIPropria} isPropria={true} responsavel="Isaque" />);
      expect(screen.getByText('Você')).toBeDefined();
      expect(screen.queryByText('Isaque')).toBeNull();
      expect(screen.getByText('TI')).toBeDefined();
    });

    it('não deve atribuir o nome do responsável a mensagens do solicitante', () => {
      const msgSolicitante: ChamadoMensagem = {
        ...mensagemExemplo,
        autor_id: 'user-2',
        autor_nome: 'Aline',
        autor_tipo: 'usuario',
        mensagem: 'Poderia arrumar meu computador.',
      };

      render(<MensagemChat mensagem={msgSolicitante} isPropria={false} responsavel="Isaque" />);
      expect(screen.getByText('Aline')).toBeDefined();
      expect(screen.getByText('Solicitante')).toBeDefined();
      expect(screen.queryByText('Isaque')).toBeNull();
      expect(screen.queryByText('TI')).toBeNull();
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

  describe('5. Regressões e Estabilidade do Chat (CORREÇÃO 1, 2, 4, 5, 8, 9)', () => {
    it('CORREÇÃO 1: Abrir o chat realiza apenas uma busca inicial e a callback do pai não dispara segundo fetch', async () => {
      const obterSpy = vi.spyOn(chatActions, 'obterMensagensDoChamado').mockResolvedValue({
        mensagens: [
          {
            id: 'm1',
            chamado_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            autor_id: 'user-123',
            autor_nome: 'Você',
            autor_tipo: 'usuario',
            mensagem: 'Primeira mensagem',
            created_at: '2026-08-30T10:00:00Z',
          },
        ],
        hasMore: false,
      });

      const marcarSpy = vi.spyOn(chatActions, 'marcarChatComoLido').mockResolvedValue({ success: true });

      // Componente pai simulado que altera seu próprio estado quando onUnreadCleared é chamado
      function PaiComChat() {
        const [unread, setUnread] = useState(5);
        return (
          <div>
            <span data-testid="unread-count">{unread}</span>
            <ChamadoChat
              chamadoId="a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
              status="Em Andamento"
              currentUserId="user-123"
              onUnreadCleared={() => setUnread(0)}
            />
          </div>
        );
      }

      render(<PaiComChat />);

      await waitFor(() => {
        expect(screen.getByText('Primeira mensagem')).toBeDefined();
      });

      // O contador deve ter sido zerado no pai
      expect(screen.getByTestId('unread-count').textContent).toBe('0');

      // A busca inicial deve ter sido executada exatamente 1 vez
      expect(obterSpy).toHaveBeenCalledTimes(1);
      expect(marcarSpy).toHaveBeenCalledTimes(1);
    });

    it('CORREÇÃO 2 - Cenário A: Server Action respondendo antes do Realtime não duplica mensagem', async () => {
      vi.spyOn(chatActions, 'obterMensagensDoChamado').mockResolvedValue({
        mensagens: [],
        hasMore: false,
      });
      vi.spyOn(chatActions, 'marcarChatComoLido').mockResolvedValue({ success: true });

      const mensagemOficial: ChamadoMensagem = {
        id: 'msg-oficial-100',
        chamado_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        autor_id: 'user-123',
        autor_nome: 'Você',
        autor_tipo: 'usuario',
        mensagem: 'Mensagem teste',
        created_at: '2026-08-30T12:00:00Z',
      };

      vi.spyOn(chatActions, 'enviarMensagemDoChamado').mockResolvedValue(mensagemOficial);

      render(
        <ChamadoChat
          chamadoId="a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
          status="Em Andamento"
          currentUserId="user-123"
        />
      );

      await waitFor(() => {
        expect(screen.queryByText(/Carregando/i)).toBeNull();
        expect(screen.getByText(/Converse com a equipe de TI/i)).toBeDefined();
      });

      const textarea = screen.getByRole('textbox', { name: /campo de mensagem/i });
      fireEvent.change(textarea, { target: { value: 'Mensagem teste' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

      // 1. Server Action responde
      await waitFor(() => {
        expect(screen.getAllByText('Mensagem teste')).toHaveLength(1);
      });

      // 2. Realtime INSERT chega depois com a mesma mensagem oficial
      act(() => {
        realtimeEventHandlers.forEach(handler => handler({ new: mensagemOficial }));
      });

      // Permanece exatamente uma ocorrência
      expect(screen.getAllByText('Mensagem teste')).toHaveLength(1);
    });

    it('CORREÇÃO 2 - Cenário B: Realtime chegando antes da resposta da Server Action não duplica mensagem', async () => {
      vi.spyOn(chatActions, 'obterMensagensDoChamado').mockResolvedValue({
        mensagens: [],
        hasMore: false,
      });
      vi.spyOn(chatActions, 'marcarChatComoLido').mockResolvedValue({ success: true });

      const mensagemOficial: ChamadoMensagem = {
        id: 'msg-oficial-200',
        chamado_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        autor_id: 'user-123',
        autor_nome: 'Você',
        autor_tipo: 'usuario',
        mensagem: 'Mensagem teste corrida',
        created_at: '2026-08-30T12:05:00Z',
      };

      let resolveAction: (val: ChamadoMensagem) => void = () => {};
      const actionPromise = new Promise<ChamadoMensagem>((resolve) => {
        resolveAction = resolve;
      });

      vi.spyOn(chatActions, 'enviarMensagemDoChamado').mockReturnValue(actionPromise);

      render(
        <ChamadoChat
          chamadoId="a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
          status="Em Andamento"
          currentUserId="user-123"
        />
      );

      await waitFor(() => {
        expect(screen.queryByText(/Carregando/i)).toBeNull();
        expect(screen.getByText(/Converse com a equipe de TI/i)).toBeDefined();
      });

      const textarea = screen.getByRole('textbox', { name: /campo de mensagem/i });
      fireEvent.change(textarea, { target: { value: 'Mensagem teste corrida' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

      // 1. Mensagem otimista exibida
      expect(screen.getAllByText('Mensagem teste corrida')).toHaveLength(1);

      // 2. Realtime INSERT chega PRIMEIRO (antes da resposta da action)
      act(() => {
        realtimeEventHandlers.forEach(handler => handler({ new: mensagemOficial }));
      });

      // 3. Agora a Server Action responde e resolve a promise
      await act(async () => {
        resolveAction(mensagemOficial);
      });

      // Permanece exatamente uma ocorrência após resolução da ação
      await waitFor(() => {
        expect(screen.getAllByText('Mensagem teste corrida')).toHaveLength(1);
      });
    });

    it('CORREÇÃO 2: Retry com sucesso não duplica mensagem', async () => {
      vi.spyOn(chatActions, 'obterMensagensDoChamado').mockResolvedValue({
        mensagens: [],
        hasMore: false,
      });
      vi.spyOn(chatActions, 'marcarChatComoLido').mockResolvedValue({ success: true });

      const mensagemOficial: ChamadoMensagem = {
        id: 'msg-retry-1',
        chamado_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        autor_id: 'user-123',
        autor_nome: 'Você',
        autor_tipo: 'usuario',
        mensagem: 'Tentando reenviar',
        created_at: '2026-08-30T12:10:00Z',
      };

      // Primeira tentativa falha
      vi.spyOn(chatActions, 'enviarMensagemDoChamado')
        .mockRejectedValueOnce(new Error('Falha de rede'))
        .mockResolvedValueOnce(mensagemOficial);

      render(
        <ChamadoChat
          chamadoId="a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
          status="Em Andamento"
          currentUserId="user-123"
        />
      );

      await waitFor(() => {
        expect(screen.queryByText(/Carregando/i)).toBeNull();
        expect(screen.getByText(/Converse com a equipe de TI/i)).toBeDefined();
      });

      const textarea = screen.getByRole('textbox', { name: /campo de mensagem/i });
      fireEvent.change(textarea, { target: { value: 'Tentando reenviar' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

      await waitFor(() => {
        expect(screen.getByText('Falha no envio')).toBeDefined();
      });

      const retryBtn = screen.getByText('Tentar novamente');
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.queryByText('Falha no envio')).toBeNull();
        expect(screen.getAllByText('Tentando reenviar')).toHaveLength(1);
      });
    });

    it('CORREÇÃO 2: O mesmo ID Realtime recebido duas vezes permanece uma única vez', async () => {
      vi.spyOn(chatActions, 'obterMensagensDoChamado').mockResolvedValue({
        mensagens: [],
        hasMore: false,
      });
      vi.spyOn(chatActions, 'marcarChatComoLido').mockResolvedValue({ success: true });

      const msgDuplicada: ChamadoMensagem = {
        id: 'msg-dup-1',
        chamado_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        autor_id: 'ti-1',
        autor_nome: 'Equipe de TI',
        autor_tipo: 'ti',
        mensagem: 'Broadcast duplicado',
        created_at: '2026-08-30T12:15:00Z',
      };

      render(
        <ChamadoChat
          chamadoId="a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
          status="Em Andamento"
          currentUserId="user-123"
        />
      );

      await waitFor(() => {
        expect(screen.queryByText(/Carregando/i)).toBeNull();
        expect(screen.getByText(/Converse com a equipe de TI/i)).toBeDefined();
      });

      // Dispara o primeiro evento
      act(() => {
        realtimeEventHandlers.forEach(handler => handler({ new: msgDuplicada }));
      });

      // Dispara o segundo evento idêntico
      act(() => {
        realtimeEventHandlers.forEach(handler => handler({ new: msgDuplicada }));
      });

      expect(screen.getAllByText('Broadcast duplicado')).toHaveLength(1);
    });

    it('CORREÇÃO 5: Falha em marcarChatComoLido não chama onUnreadCleared', async () => {
      vi.spyOn(chatActions, 'obterMensagensDoChamado').mockResolvedValue({
        mensagens: [],
        hasMore: false,
      });
      vi.spyOn(chatActions, 'marcarChatComoLido').mockResolvedValue({ success: false });

      const onUnreadCleared = vi.fn();

      render(
        <ChamadoChat
          chamadoId="a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
          status="Em Andamento"
          currentUserId="user-123"
          onUnreadCleared={onUnreadCleared}
        />
      );

      await waitFor(() => {
        expect(screen.queryByText(/Carregando/i)).toBeNull();
      });

      expect(onUnreadCleared).not.toHaveBeenCalled();
    });

    it('CORREÇÃO 4: UPDATE do chamado para Concluído bloqueia o compositor e preserva mensagens', async () => {
      vi.spyOn(chatActions, 'obterMensagensDoChamado').mockResolvedValue({
        mensagens: [
          {
            id: 'm-hist',
            chamado_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            autor_id: 'user-123',
            autor_nome: 'Você',
            autor_tipo: 'usuario',
            mensagem: 'Mensagem do histórico anterior',
            created_at: '2026-08-30T10:00:00Z',
          },
        ],
        hasMore: false,
      });
      vi.spyOn(chatActions, 'marcarChatComoLido').mockResolvedValue({ success: true });

      const { rerender } = render(
        <ChamadoChat
          chamadoId="a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
          status="Em Andamento"
          currentUserId="user-123"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Mensagem do histórico anterior')).toBeDefined();
        expect(screen.getByRole('textbox')).toBeDefined();
      });

      // Simula a transição de status para Concluído
      rerender(
        <ChamadoChat
          chamadoId="a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
          status="Concluído"
          currentUserId="user-123"
        />
      );

      // Compositor deve ser substituído pelo aviso
      expect(screen.queryByRole('textbox')).toBeNull();
      expect(
        screen.getByText(/Este atendimento foi concluído\. A conversa está disponível apenas para consulta\./i)
      ).toBeDefined();

      // Histórico deve permanecer visível
      expect(screen.getByText('Mensagem do histórico anterior')).toBeDefined();
    });

    it('reconexão Realtime preserva páginas antigas já carregadas', async () => {
      const mensagemRecente: ChamadoMensagem = {
        id: 'msg-recente',
        chamado_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        autor_id: 'user-123',
        autor_nome: 'Você',
        autor_tipo: 'usuario',
        mensagem: 'Mensagem recente',
        created_at: '2026-08-30T12:00:00Z',
      };
      const mensagemAntiga: ChamadoMensagem = {
        ...mensagemRecente,
        id: 'msg-antiga',
        mensagem: 'Mensagem antiga preservada',
        created_at: '2026-08-29T12:00:00Z',
      };
      const mensagemDaReconexao: ChamadoMensagem = {
        ...mensagemRecente,
        id: 'msg-reconexao',
        autor_id: 'ti-1',
        autor_nome: 'Equipe de TI',
        autor_tipo: 'ti',
        mensagem: 'Mensagem recebida na reconexão',
        created_at: '2026-08-30T12:01:00Z',
      };

      vi.spyOn(chatActions, 'obterMensagensDoChamado')
        .mockResolvedValueOnce({
          mensagens: [mensagemRecente],
          hasMore: true,
          nextCursor: {
            beforeCreatedAt: mensagemRecente.created_at,
            beforeId: mensagemRecente.id,
          },
        })
        .mockResolvedValueOnce({ mensagens: [mensagemAntiga], hasMore: false })
        .mockResolvedValueOnce({
          mensagens: [mensagemRecente, mensagemDaReconexao],
          hasMore: false,
        });
      vi.spyOn(chatActions, 'marcarChatComoLido').mockResolvedValue({ success: true });

      render(
        <ChamadoChat
          chamadoId="a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
          status="Em Andamento"
          currentUserId="user-123"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Mensagem recente')).toBeDefined();
      });

      fireEvent.click(screen.getByText('Carregar mensagens anteriores'));
      await waitFor(() => {
        expect(screen.getByText('Mensagem antiga preservada')).toBeDefined();
      });

      await act(async () => {
        realtimeStatusHandlers.forEach(handler => handler('CHANNEL_ERROR'));
        realtimeStatusHandlers.forEach(handler => handler('SUBSCRIBED'));
      });

      await waitFor(() => {
        expect(screen.getByText('Mensagem recebida na reconexão')).toBeDefined();
        expect(screen.getByText('Mensagem antiga preservada')).toBeDefined();
      });
    });

    it('CORREÇÃO 9: Cleanup remove os canais Realtime ao desmontar', () => {
      vi.spyOn(chatActions, 'obterMensagensDoChamado').mockResolvedValue({
        mensagens: [],
        hasMore: false,
      });
      vi.spyOn(chatActions, 'marcarChatComoLido').mockResolvedValue({ success: true });

      const { unmount } = render(
        <ChamadoChat
          chamadoId="a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
          status="Em Andamento"
          currentUserId="user-123"
        />
      );

      unmount();
      expect(supabase.removeChannel).toHaveBeenCalled();
    });
  });

  describe('6. Paginação Segura e Ordem Cronológica (CORREÇÃO 3)', () => {
    it('deve calcular cursor a partir da mensagem mais antiga e manter ordem cronológica ao inverter', async () => {
      // Simulação do comportamento da query do Supabase que retorna 51 itens em ordem decrescente (created_at desc, id desc)
      const dataDecrescente: ChamadoMensagem[] = [];
      const baseTime = new Date('2026-08-30T10:00:00Z').getTime();

      for (let i = 51; i >= 1; i--) {
        dataDecrescente.push({
          id: `msg-${i.toString().padStart(3, '0')}`,
          chamado_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          autor_id: 'u1',
          autor_nome: 'User',
          autor_tipo: 'usuario',
          mensagem: `Mensagem ${i}`,
          created_at: new Date(baseTime + i * 1000).toISOString(),
        });
      }

      mockSupabaseSSR.auth.getUser.mockResolvedValue({
        data: { user: { id: 'u1', email: 'user@maplebeararaxa.com.br' } },
        error: null,
      });

      mockSupabaseSSR.from.mockImplementation((table: string) => {
        if (table === 'chamados') {
          return createChainableMock({ id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', user_id: 'u1' });
        }
        if (table === 'app_admins') {
          return createChainableMock(null);
        }
        if (table === 'chamado_mensagens') {
          return createChainableMock(dataDecrescente);
        }
        return createChainableMock(null);
      });

      const res = await chatActions.obterMensagensDoChamado('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 50);

      expect(res.hasMore).toBe(true);
      expect(res.mensagens).toHaveLength(50);

      // A lista retornada para a UI deve estar em ordem cronológica (antiga -> nova)
      expect(res.mensagens[0].mensagem).toBe('Mensagem 2');
      expect(res.mensagens[49].mensagem).toBe('Mensagem 51');

      // O cursor deve apontar para o elemento mais antigo da fatia (Mensagem 2, não Mensagem 51!)
      expect(res.nextCursor?.beforeCreatedAt).toBe(dataDecrescente[49].created_at);
      expect(res.nextCursor?.beforeId).toBe('msg-002');
    });

    it('deve desempilhar histórico anterior sem duplicar IDs no componente ChamadoChat', async () => {
      const pagina1 = [
        {
          id: 'msg-003',
          chamado_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          autor_id: 'u1',
          autor_nome: 'Você',
          autor_tipo: 'usuario' as const,
          mensagem: 'Mensagem recente 3',
          created_at: '2026-08-30T10:03:00Z',
        },
      ];

      const pagina2 = [
        {
          id: 'msg-001',
          chamado_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          autor_id: 'u1',
          autor_nome: 'Você',
          autor_tipo: 'usuario' as const,
          mensagem: 'Mensagem antiga 1',
          created_at: '2026-08-30T10:01:00Z',
        },
        {
          id: 'msg-002',
          chamado_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          autor_id: 'u1',
          autor_nome: 'Você',
          autor_tipo: 'usuario' as const,
          mensagem: 'Mensagem intermediária 2',
          created_at: '2026-08-30T10:02:00Z',
        },
      ];

      vi.spyOn(chatActions, 'obterMensagensDoChamado')
        .mockResolvedValueOnce({
          mensagens: pagina1,
          hasMore: true,
          nextCursor: { beforeCreatedAt: '2026-08-30T10:03:00Z', beforeId: 'msg-003' },
        })
        .mockResolvedValueOnce({
          mensagens: pagina2,
          hasMore: false,
        });

      vi.spyOn(chatActions, 'marcarChatComoLido').mockResolvedValue({ success: true });

      render(
        <ChamadoChat
          chamadoId="a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
          status="Em Andamento"
          currentUserId="u1"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Mensagem recente 3')).toBeDefined();
        expect(screen.getByText('Carregar mensagens anteriores')).toBeDefined();
      });

      const carregarMaisBtn = screen.getByText('Carregar mensagens anteriores');
      fireEvent.click(carregarMaisBtn);

      await waitFor(() => {
        expect(screen.getByText('Mensagem antiga 1')).toBeDefined();
        expect(screen.getByText('Mensagem intermediária 2')).toBeDefined();
        expect(screen.getByText('Mensagem recente 3')).toBeDefined();
      });

      // O botão desaparece pois hasMore = false
      expect(screen.queryByText('Carregar mensagens anteriores')).toBeNull();
    });
  });

  describe('7. Exibição do Responsável da TI no Componente ChamadoChat', () => {
    it('deve repassar o nome do responsável para as mensagens da TI quando visualizado pelo solicitante', async () => {
      vi.spyOn(chatActions, 'obterMensagensDoChamado').mockResolvedValue({
        mensagens: [
          {
            id: 'msg-u1',
            chamado_id: 'chamado-10',
            autor_id: 'user-solicitante',
            autor_nome: 'Aline',
            autor_tipo: 'usuario' as const,
            mensagem: 'Meu monitor não liga.',
            created_at: '2026-08-30T10:00:00Z',
          },
          {
            id: 'msg-ti1',
            chamado_id: 'chamado-10',
            autor_id: 'admin-isaque',
            autor_nome: 'Equipe de TI',
            autor_tipo: 'ti' as const,
            mensagem: 'Olá Aline, estou indo verificar o cabo de força.',
            created_at: '2026-08-30T10:05:00Z',
          },
        ],
        hasMore: false,
      });

      vi.spyOn(chatActions, 'marcarChatComoLido').mockResolvedValue({ success: true });

      render(
        <ChamadoChat
          chamadoId="chamado-10"
          status="Em Andamento"
          responsavel="Isaque"
          currentUserId="user-solicitante"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Meu monitor não liga.')).toBeDefined();
        expect(screen.getByText('Olá Aline, estou indo verificar o cabo de força.')).toBeDefined();
      });

      // A mensagem própria do solicitante deve exibir "Você"
      expect(screen.getByText('Você')).toBeDefined();

      // A mensagem da TI recebida pelo solicitante deve exibir o nome do responsável "Isaque" e badge "TI"
      expect(screen.getByText('Isaque')).toBeDefined();
      expect(screen.getByText('TI')).toBeDefined();
      expect(screen.queryByText('Equipe de TI')).toBeNull();
    });

    it('deve exibir o nome do responsável no histórico de um chamado Concluído', async () => {
      vi.spyOn(chatActions, 'obterMensagensDoChamado').mockResolvedValue({
        mensagens: [
          {
            id: 'msg-ti2',
            chamado_id: 'chamado-11',
            autor_id: 'admin-pedro',
            autor_nome: 'Equipe de TI',
            autor_tipo: 'ti' as const,
            mensagem: 'Problema solucionado com sucesso.',
            created_at: '2026-08-30T11:00:00Z',
          },
        ],
        hasMore: false,
      });

      vi.spyOn(chatActions, 'marcarChatComoLido').mockResolvedValue({ success: true });

      render(
        <ChamadoChat
          chamadoId="chamado-11"
          status="Concluído"
          responsavel="Pedro"
          currentUserId="user-solicitante"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Problema solucionado com sucesso.')).toBeDefined();
        expect(screen.getByText('Pedro')).toBeDefined();
        expect(screen.getByText('TI')).toBeDefined();
      });

      // Verifica aviso de chamado concluído
      expect(
        screen.getByText(/Este atendimento foi concluído\. A conversa está disponível apenas para consulta\./i)
      ).toBeDefined();
    });

    it('deve manter funcionamento correto e fallback "Equipe de TI" quando responsavel não for informado', async () => {
      vi.spyOn(chatActions, 'obterMensagensDoChamado').mockResolvedValue({
        mensagens: [
          {
            id: 'msg-ti3',
            chamado_id: 'chamado-12',
            autor_id: 'admin-desconhecido',
            autor_nome: 'Equipe de TI',
            autor_tipo: 'ti' as const,
            mensagem: 'Atendimento inicial sem responsável.',
            created_at: '2026-08-30T12:00:00Z',
          },
        ],
        hasMore: false,
      });

      vi.spyOn(chatActions, 'marcarChatComoLido').mockResolvedValue({ success: true });

      render(
        <ChamadoChat
          chamadoId="chamado-12"
          status="Pendente"
          currentUserId="user-solicitante"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Atendimento inicial sem responsável.')).toBeDefined();
        expect(screen.getByText('Equipe de TI')).toBeDefined();
        expect(screen.getByText('TI')).toBeDefined();
      });
    });
  });
});
