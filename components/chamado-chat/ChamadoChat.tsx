'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { ChamadoMensagem, CursorPaginacaoChat } from '@/types/database';
import {
  obterMensagensDoChamado,
  enviarMensagemDoChamado,
  marcarChatComoLido,
} from '@/app/actions/chamadoChat';
import { MensagemChat } from './MensagemChat';
import { CompositorMensagem } from './CompositorMensagem';
import { Button } from '@/components/ui/Button';

interface ChamadoChatProps {
  chamadoId: string;
  status: string;
  isAdm?: boolean;
  currentUserId?: string;
  onUnreadCleared?: () => void;
}

interface MensagemComStatus extends ChamadoMensagem {
  statusEnvio?: 'sending' | 'sent' | 'error';
}

export function ChamadoChat({
  chamadoId,
  status,
  isAdm = false,
  currentUserId,
  onUnreadCleared,
}: ChamadoChatProps) {
  const [mensagens, setMensagens] = useState<MensagemComStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<CursorPaginacaoChat | undefined>();
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedUserId, setResolvedUserId] = useState<string | undefined>(currentUserId);

  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const onUnreadClearedRef = useRef(onUnreadCleared);

  useEffect(() => {
    onUnreadClearedRef.current = onUnreadCleared;
  }, [onUnreadCleared]);

  // Obtém o ID do usuário conectado caso não tenha sido passado por props
  useEffect(() => {
    if (!resolvedUserId) {
      supabase.auth.getUser().then(({ data }) => {
        if (data.user?.id) {
          setResolvedUserId(data.user.id);
        }
      });
    }
  }, [resolvedUserId]);

  const scrollToBottom = useCallback((smooth = false) => {
    if (containerRef.current) {
      if (typeof containerRef.current.scrollTo === 'function') {
        containerRef.current.scrollTo({
          top: containerRef.current.scrollHeight,
          behavior: smooth ? 'smooth' : 'auto',
        });
      } else {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
    }
  }, []);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 80;
  };

  // Carrega as mensagens iniciais apenas quando chamadoId mudar
  const carregarMensagensIniciais = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await obterMensagensDoChamado(chamadoId, 50);
      setMensagens(res.mensagens.map(m => ({ ...m, statusEnvio: 'sent' })));
      setHasMore(res.hasMore);
      setNextCursor(res.nextCursor);

      // Marca o chamado como lido
      await marcarChatComoLido(chamadoId);
      onUnreadClearedRef.current?.();

      setTimeout(() => scrollToBottom(false), 50);
    } catch (err) {
      console.error('Erro ao carregar mensagens do chat:', err);
      let errorMessage = err instanceof Error ? err.message : 'Não foi possível carregar a conversa.';
      if (errorMessage.includes('Server Components render') || errorMessage.includes('digest')) {
        errorMessage = 'Não foi possível carregar a conversa. Se for a primeira execução, certifique-se de que a migration do chat foi aplicada no Supabase.';
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [chamadoId, scrollToBottom]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarMensagensIniciais();
  }, [carregarMensagensIniciais]);

  // Carrega mensagens anteriores (paginação segura por cursor)
  const carregarMensagensAnteriores = async () => {
    if (!hasMore || !nextCursor || loadingMore) return;

    setLoadingMore(true);
    const container = containerRef.current;
    const previousScrollHeight = container?.scrollHeight || 0;

    try {
      const res = await obterMensagensDoChamado(chamadoId, 50, nextCursor);
      setMensagens(prev => {
        // Deduplica com mensagens já presentes
        const idsExistentes = new Set(prev.map(m => m.id));
        const novasMensagens = res.mensagens.filter(m => !idsExistentes.has(m.id));
        return [...novasMensagens.map(m => ({ ...m, statusEnvio: 'sent' as const })), ...prev];
      });
      setHasMore(res.hasMore);
      setNextCursor(res.nextCursor);

      // Preserva a posição de rolagem após carregar mensagens antigas
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight - previousScrollHeight;
        }
      });
    } catch (err) {
      console.error('Erro ao carregar histórico anterior:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  // Assinatura Supabase Realtime para a conversa aberta
  useEffect(() => {
    const channelName = `chat-chamado-${chamadoId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chamado_mensagens',
          filter: `chamado_id=eq.${chamadoId}`,
        },
        (payload) => {
          const novaMsg = payload.new as ChamadoMensagem;

          setMensagens(prev => {
            // Verifica se a mensagem já está na lista (deduplicação)
            const index = prev.findIndex(m => m.id === novaMsg.id);
            if (index !== -1) {
              const updated = [...prev];
              updated[index] = { ...novaMsg, statusEnvio: 'sent' };
              return updated;
            }
            return [...prev, { ...novaMsg, statusEnvio: 'sent' }];
          });

          // Se a mensagem for de outra pessoa, marca como lida e atualiza badges
          if (resolvedUserId && novaMsg.autor_id !== resolvedUserId) {
            marcarChatComoLido(chamadoId, novaMsg.created_at);
            onUnreadClearedRef.current?.();
          }

          if (isAtBottomRef.current) {
            setTimeout(() => scrollToBottom(true), 50);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`Realtime do chat ${chamadoId} desconectado. Tentando reconectar...`);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chamadoId, resolvedUserId, scrollToBottom]);

  // Envio de mensagem com atualização otimista
  const handleEnviar = async (texto: string) => {
    if (!texto.trim() || isSending) return;

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const mensagemOtimista: MensagemComStatus = {
      id: tempId,
      chamado_id: chamadoId,
      autor_id: resolvedUserId || null,
      autor_nome: isAdm ? 'Equipe de TI' : 'Você',
      autor_tipo: isAdm ? 'ti' : 'usuario',
      mensagem: texto,
      created_at: new Date().toISOString(),
      statusEnvio: 'sending',
    };

    setMensagens(prev => [...prev, mensagemOtimista]);
    setIsSending(true);
    setTimeout(() => scrollToBottom(true), 50);

    try {
      const mensagemSalva = await enviarMensagemDoChamado(chamadoId, texto);

      // Substitui a mensagem temporária pela mensagem oficial retornada do banco
      setMensagens(prev =>
        prev.map(m => (m.id === tempId ? { ...mensagemSalva, statusEnvio: 'sent' } : m))
      );
      onUnreadClearedRef.current?.();
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err);
      // Marca a mensagem otimista como com erro para permitir retry
      setMensagens(prev =>
        prev.map(m => (m.id === tempId ? { ...m, statusEnvio: 'error' } : m))
      );
    } finally {
      setIsSending(false);
    }
  };

  // Reenvio de mensagem que falhou
  const handleRetry = async (tempId: string, texto: string) => {
    setMensagens(prev =>
      prev.map(m => (m.id === tempId ? { ...m, statusEnvio: 'sending' } : m))
    );

    try {
      const mensagemSalva = await enviarMensagemDoChamado(chamadoId, texto);
      setMensagens(prev =>
        prev.map(m => (m.id === tempId ? { ...mensagemSalva, statusEnvio: 'sent' } : m))
      );
    } catch (err) {
      console.error('Falha ao reenviar mensagem:', err);
      setMensagens(prev =>
        prev.map(m => (m.id === tempId ? { ...m, statusEnvio: 'error' } : m))
      );
    }
  };

  const isConcluido = status === 'Concluído';

  return (
    <div className="flex flex-col h-[480px] bg-canvas rounded-2xl border border-border overflow-hidden">
      {/* Cabeçalho do Chat */}
      <div className="px-4 py-3 bg-surface border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <h4 className="text-sm font-bold text-text">Conversa com a Equipe de TI</h4>
        </div>
        <span className="text-xs text-text-muted">
          {isConcluido ? 'Atendimento Concluído' : 'Canal Aberto'}
        </span>
      </div>

      {/* Área de Mensagens com Rolagem */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 p-4 overflow-y-auto space-y-4"
        tabIndex={0}
        aria-label="Histórico de mensagens do chamado"
      >
        {/* Botão de carregar histórico anterior */}
        {hasMore && (
          <div className="text-center pb-2">
            <Button
              type="button"
              variant="secondary"
              onClick={carregarMensagensAnteriores}
              isLoading={loadingMore}
              className="!py-1.5 !px-3 text-xs"
            >
              Carregar mensagens anteriores
            </Button>
          </div>
        )}

        {/* Estado de Carregamento Inicial */}
        {loading ? (
          <div className="space-y-4 py-6">
            <div className="flex flex-col gap-2 max-w-[70%] animate-pulse">
              <div className="h-3 bg-surface-muted rounded w-24"></div>
              <div className="h-12 bg-surface-muted rounded-2xl"></div>
            </div>
            <div className="flex flex-col gap-2 max-w-[70%] ml-auto items-end animate-pulse">
              <div className="h-3 bg-surface-muted rounded w-16"></div>
              <div className="h-12 bg-surface-muted rounded-2xl w-full"></div>
            </div>
          </div>
        ) : error ? (
          <div className="p-6 text-center text-status-danger text-sm flex flex-col items-center gap-3">
            <p>{error}</p>
            <Button variant="secondary" className="!py-1.5 !px-3 text-xs" onClick={carregarMensagensIniciais}>
              Tentar carregar novamente
            </Button>
          </div>
        ) : mensagens.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center text-text-muted">
            <div className="w-12 h-12 rounded-full bg-surface-muted flex items-center justify-center mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-text-subtle">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a.75.75 0 01-1.074-.865 5.25 5.25 0 001.023-2.494C3.845 16.204 3 14.208 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
              </svg>
            </div>
            <p className="text-sm font-medium">
              Converse com a equipe de TI para acompanhar o andamento deste chamado.
            </p>
          </div>
        ) : (
          mensagens.map(msg => {
            const isPropria = Boolean(
              (resolvedUserId && msg.autor_id === resolvedUserId) ||
              (isAdm && msg.autor_tipo === 'ti') ||
              (!isAdm && msg.autor_tipo === 'usuario' && resolvedUserId && msg.autor_id === resolvedUserId)
            );

            return (
              <MensagemChat
                key={msg.id}
                mensagem={msg}
                isPropria={isPropria}
                statusEnvio={msg.statusEnvio}
                onRetry={msg.statusEnvio === 'error' ? () => handleRetry(msg.id, msg.mensagem) : undefined}
              />
            );
          })
        )}
      </div>

      {/* Compositor de Mensagens */}
      <div className="p-3 bg-surface border-t border-border">
        <CompositorMensagem
          onEnviar={handleEnviar}
          isSending={isSending}
          isConcluido={isConcluido}
        />
      </div>
    </div>
  );
}
