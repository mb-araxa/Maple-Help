'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { obterMeusChamados } from '@/app/actions/chamados';
import { obterContadoresNaoLidos } from '@/app/actions/chamadoChat';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ToastProvider';
import { usePageTitle } from '@/lib/usePageTitle';
import { Chamado, ContadoresNaoLidos } from '@/types/database';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { Button } from '@/components/ui/Button';
import { AvaliacaoChamado } from '@/components/AvaliacaoChamado';
import { ChamadoChat } from '@/components/chamado-chat/ChamadoChat';
import { IndicadorNaoLidas } from '@/components/chamado-chat/IndicadorNaoLidas';

export default function MeusChamadosPage() {
  const router = useRouter();
  const { addToast } = useToast();
  usePageTitle('Meus Chamados');
  
  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [expandedChatId, setExpandedChatId] = useState<string | null>(null);
  const [contadoresNaoLidos, setContadoresNaoLidos] = useState<ContadoresNaoLidos>({});

  const expandedChatIdRef = useRef<string | null>(null);
  useEffect(() => {
    expandedChatIdRef.current = expandedChatId;
  }, [expandedChatId]);

  const carregarDados = useCallback(async () => {
    try {
      const [dadosChamados, contadores] = await Promise.all([
        obterMeusChamados(),
        obterContadoresNaoLidos(),
      ]);
      setChamados(dadosChamados);
      setContadoresNaoLidos(contadores);
    } catch (error) {
      console.error("Erro ao buscar seus chamados:", error);
      addToast('Erro ao carregar seus chamados.', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarDados();

    // Assinatura única Realtime na página para atualizar badges de não lidas
    const channel = supabase
      .channel('meus-chamados-badges')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chamado_mensagens' },
        (payload) => {
          const novaMsg = payload.new as { chamado_id: string; autor_tipo: string };
          
          if (novaMsg.autor_tipo === 'ti') {
            setContadoresNaoLidos(prev => {
              // Se o chat deste chamado já estiver aberto, não incrementa o badge
              if (expandedChatIdRef.current === novaMsg.chamado_id) return prev;
              return {
                ...prev,
                [novaMsg.chamado_id]: (prev[novaMsg.chamado_id] || 0) + 1,
              };
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [carregarDados]);

  const handleToggleChat = (chamadoId: string) => {
    if (expandedChatId === chamadoId) {
      setExpandedChatId(null);
    } else {
      setExpandedChatId(chamadoId);
      // Limpa o contador localmente ao abrir a conversa
      setContadoresNaoLidos(prev => ({
        ...prev,
        [chamadoId]: 0,
      }));
    }
  };

  const handleUnreadCleared = useCallback((chamadoId: string) => {
    setContadoresNaoLidos(prev => ({
      ...prev,
      [chamadoId]: 0,
    }));
  }, []);

  return (
    <div className="min-h-screen bg-canvas p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        
        {/* Botão Voltar */}
        <button 
          onClick={() => router.push('/menu')}
          className="mb-8 flex items-center text-text-subtle hover:text-text transition-colors font-medium text-sm gap-2 cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Voltar para o Menu
        </button>

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-text tracking-tight">Meus Chamados</h1>
            <p className="text-text-muted mt-1">Acompanhe o status das suas solicitações para a TI e converse em tempo real.</p>
          </div>
          
          <Button 
            onClick={() => router.push('/chamado')}
            className="flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Novo Chamado
          </Button>
        </div>

        {/* Conteúdo */}
        {loading ? (
          <div className="flex flex-col space-y-4">
            {[1, 2, 3].map(i => (
              <SurfaceCard key={i} className="p-6 animate-pulse">
                <div className="h-4 bg-surface-muted rounded w-1/4 mb-4"></div>
                <div className="h-6 bg-surface-muted rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-surface-muted rounded w-1/2"></div>
              </SurfaceCard>
            ))}
          </div>
        ) : chamados.length === 0 ? (
          <SurfaceCard className="p-12 text-center flex flex-col items-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-surface-muted mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-text-subtle">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-text mb-1">Você não tem chamados</h3>
            <p className="text-text-muted">Quando você abrir um novo chamado, ele aparecerá aqui para você acompanhar.</p>
          </SurfaceCard>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {chamados.map(chamado => {
              const isChatExpanded = expandedChatId === chamado.id;
              const unreadCount = contadoresNaoLidos[chamado.id] || 0;

              return (
                <SurfaceCard key={chamado.id} className="p-6 transition-shadow">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-4">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-text-subtle">
                          {chamado.categoria}
                        </span>
                        <span className="text-border">•</span>
                        <span className="text-xs text-text-muted">
                          {new Date(chamado.data_criacao).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                        </span>
                      </div>
                      <h3 className="text-lg font-bold text-text">{chamado.local}</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={chamado.status} />
                    </div>
                  </div>
                  
                  <div className="bg-surface-muted p-4 rounded-xl border border-border mb-4">
                    <p className="text-text text-sm whitespace-pre-wrap">{chamado.descricao}</p>
                  </div>

                  {chamado.status === 'Concluído' && chamado.resolucao && (
                    <div className="mt-4 pt-4 border-t border-border mb-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 w-6 h-6 rounded-full bg-status-completed-bg flex items-center justify-center flex-shrink-0">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-emerald-600">
                            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-status-completed-text mb-1">Solução da TI:</h4>
                          <p className="text-sm text-status-completed-text/90 leading-relaxed">{chamado.resolucao}</p>
                          {chamado.tempo_gasto && (
                            <span className="inline-block mt-2 text-xs font-medium text-status-completed-text/80">
                              Resolvido em: {chamado.tempo_gasto}
                            </span>
                          )}
                        </div>
                      </div>
                      <AvaliacaoChamado chamadoId={chamado.id} />
                    </div>
                  )}

                  {/* Seção de Conversa com a Equipe de TI */}
                  <div className="pt-2 border-t border-border">
                    <button
                      type="button"
                      onClick={() => handleToggleChat(chamado.id)}
                      className="w-full flex items-center justify-between py-2 px-3 rounded-xl bg-surface-muted hover:bg-zinc-200/70 text-text text-sm font-semibold transition-colors cursor-pointer"
                      aria-expanded={isChatExpanded}
                    >
                      <div className="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="w-4 h-4 text-text-subtle">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                        </svg>
                        <span>Conversa com a equipe de TI</span>
                        <IndicadorNaoLidas count={unreadCount} size="sm" />
                      </div>

                      <div className="flex items-center gap-1 text-xs text-text-muted">
                        <span>{isChatExpanded ? 'Ocultar' : 'Abrir conversa'}</span>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          stroke="currentColor"
                          className={`w-4 h-4 transition-transform duration-200 ${isChatExpanded ? 'rotate-180' : ''}`}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                      </div>
                    </button>

                    {isChatExpanded && (
                      <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-200">
                        <ChamadoChat
                          chamadoId={chamado.id}
                          status={chamado.status}
                          isAdm={false}
                          onUnreadCleared={() => handleUnreadCleared(chamado.id)}
                        />
                      </div>
                    )}
                  </div>
                </SurfaceCard>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
