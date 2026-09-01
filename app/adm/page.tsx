'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { extractFirstName } from '@/lib/utils';
import { usePageTitle } from '@/lib/usePageTitle';
import { useToast } from '@/components/ToastProvider';
import {
  obterChamadosAbertos,
  obterChamadosConcluidosHoje,
  assumirChamado,
  finalizarChamado,
  deletarChamado,
} from '@/app/actions/chamados';
import { obterContadoresNaoLidos } from '@/app/actions/chamadoChat';
import { Chamado, ContadoresNaoLidos } from '@/types/database';
import { ChamadoCard } from '@/components/ChamadoCard';
import { ChamadoModal } from '@/components/ChamadoModal';
import { Button } from '@/components/ui/Button';

// O AudioContext precisa ser global e persistente para tocar em abas fora de foco (segundo plano)
let globalAudioCtx: AudioContext | null = null;

export default function Dashboard() {
  usePageTitle('Painel ADM');
  const router = useRouter();
  const { addToast } = useToast();
  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [loading, setLoading] = useState(true);
  const [chamadoSelecionado, setChamadoSelecionado] = useState<Chamado | null>(null);
  const [adminName, setAdminName] = useState<string>('TI');
  const [concluidosHoje, setConcluidosHoje] = useState<Chamado[]>([]);
  const [contadoresNaoLidos, setContadoresNaoLidos] = useState<ContadoresNaoLidos>({});

  const fetchChamados = useCallback(async () => {
    try {
      const [abertos, concluidos, contadores] = await Promise.all([
        obterChamadosAbertos(),
        obterChamadosConcluidosHoje(),
        obterContadoresNaoLidos(),
      ]);
      setChamados(abertos);
      setConcluidosHoje(concluidos);
      setContadoresNaoLidos(contadores);
    } catch (error) {
      console.error('Erro ao buscar chamados:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Função para tocar o som de notificação usando Web Audio API
  const playNotificationSound = () => {
    try {
      if (!globalAudioCtx) return;
      
      const playBeep = (startTime: number) => {
        const oscillator = globalAudioCtx!.createOscillator();
        const gainNode = globalAudioCtx!.createGain();
        
        oscillator.type = 'square';
        oscillator.frequency.value = 2500;
        
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.2, startTime + 0.01);
        gainNode.gain.linearRampToValueAtTime(0.15, startTime + 0.15);
        
        oscillator.connect(gainNode);
        gainNode.connect(globalAudioCtx!.destination);
        
        oscillator.start(startTime);
        oscillator.stop(startTime + 0.15);
      };

      const now = globalAudioCtx.currentTime;
      playBeep(now);
      playBeep(now + 0.2);
      playBeep(now + 0.4);

    } catch (e) {
      console.log('Erro ao tocar bipe', e);
    }
  };

  useEffect(() => {
    // Inicializa o AudioContext global uma única vez
    if (typeof window !== 'undefined' && !globalAudioCtx) {
      const windowWithWebkit = window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext: typeof AudioContext };
      const AudioContextClass = windowWithWebkit.AudioContext || windowWithWebkit.webkitAudioContext;
      if (AudioContextClass) {
        globalAudioCtx = new AudioContextClass();
      }
    }

    // Desbloqueia o áudio permanentemente na primeira interação do usuário na página
    const unlockAudio = async () => {
      if (globalAudioCtx && globalAudioCtx.state === 'suspended') {
        await globalAudioCtx.resume();
      }
    };
    
    document.addEventListener('click', unlockAudio);
    document.addEventListener('keydown', unlockAudio);

    // Buscar usuário logado
    const getSession = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        setAdminName(extractFirstName(user.email));
      }
    };
    getSession();

    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchChamados();

    const channel = supabase
      .channel('adm-dashboard-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chamados' },
        (payload) => {
          fetchChamados();
          if (payload.eventType === 'INSERT') {
            playNotificationSound();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chamado_mensagens' },
        (payload) => {
          const novaMsg = payload.new as { chamado_id: string; autor_tipo: string };
          if (novaMsg.autor_tipo === 'usuario') {
            playNotificationSound();
            setContadoresNaoLidos(prev => ({
              ...prev,
              [novaMsg.chamado_id]: (prev[novaMsg.chamado_id] || 0) + 1,
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };
  }, [fetchChamados]);

  const handleAssumir = async (id: string) => {
    try {
      await assumirChamado(id);
      await fetchChamados();
      
      setChamadoSelecionado(prev => prev ? { ...prev, status: 'Em Andamento', responsavel: adminName } : null);
      addToast(`Chamado assumido por ${adminName}.`, 'success');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao assumir chamado.';
      addToast(message, 'error');
    }
  };

  const handleConcluir = async (id: string, resolucao: string, tempo_gasto: string) => {
    try {
      await finalizarChamado(id, resolucao, tempo_gasto);
      await fetchChamados();
      setChamadoSelecionado(null);
      addToast('Chamado concluído com sucesso!', 'success');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao concluir chamado.';
      addToast(message, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deletarChamado(id);
      await fetchChamados();
      setChamadoSelecionado(null);
      addToast('Chamado removido.', 'warning');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao deletar chamado.';
      addToast(message, 'error');
    }
  };

  const handleUnreadCleared = useCallback((chamadoId: string) => {
    setContadoresNaoLidos(prev => {
      if (!prev[chamadoId]) return prev;
      return {
        ...prev,
        [chamadoId]: 0,
      };
    });
  }, []);

  // Separação dos chamados nas colunas do Kanban
  const pendentes = chamados.filter(c => c.status === 'Pendente');
  const emAndamento = chamados.filter(c => c.status === 'Em Andamento');
  const concluidos = concluidosHoje;

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="h-8 w-64 bg-surface-muted rounded-lg animate-pulse mb-2" />
            <div className="h-4 w-80 bg-surface-muted rounded animate-pulse" />
          </div>
          <div className="h-10 w-36 bg-surface-muted rounded-lg animate-pulse" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[0, 1, 2].map((col) => (
            <div key={col} className="flex flex-col bg-surface-muted rounded-2xl p-4 border border-border">
              <div className="flex items-center gap-2 mb-4 px-2">
                <div className="w-2.5 h-2.5 rounded-full bg-border animate-pulse" />
                <div className="h-5 w-28 bg-border rounded animate-pulse" />
              </div>
              <div className="flex flex-col gap-3">
                {[0, 1].map((card) => (
                  <div key={card} className="bg-surface p-4 rounded-2xl border border-border animate-pulse">
                    <div className="h-4 w-32 bg-surface-muted rounded mb-2" />
                    <div className="h-3 w-24 bg-surface-muted rounded mb-3" />
                    <div className="h-6 w-20 bg-surface-muted rounded-full mb-3" />
                    <div className="h-3 w-full bg-surface-muted rounded mb-1" />
                    <div className="h-3 w-3/4 bg-surface-muted rounded" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text tracking-tight">Painel de Administração</h1>
          <p className="text-text-muted mt-1">Gestão de chamados de TI em tempo real.</p>
        </div>
        
        <Button 
          onClick={() => router.push('/adm/relatorios')}
          variant="secondary"
          className="flex items-center gap-2 shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
          Ver Relatórios
        </Button>
      </div>
      
      {/* Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Coluna Pendentes */}
        <div className="flex flex-col bg-surface-muted rounded-2xl p-4 border border-border shadow-sm">
          <div className="flex items-center gap-2 mb-4 px-2">
            <div className="w-2.5 h-2.5 rounded-full bg-status-pending-bg" />
            <h2 className="font-bold text-text">Pendentes ({pendentes.length})</h2>
          </div>
          <div className="flex flex-col gap-3 overflow-y-auto max-h-[70vh] pb-4">
            {pendentes.length === 0 ? (
              <p className="text-text-muted text-sm italic p-4 text-center">Nenhum chamado pendente.</p>
            ) : (
              pendentes.map(chamado => (
                <ChamadoCard
                  key={chamado.id}
                  chamado={chamado}
                  onClick={() => setChamadoSelecionado(chamado)}
                  unreadCount={contadoresNaoLidos[chamado.id] || 0}
                />
              ))
            )}
          </div>
        </div>

        {/* Coluna Em Andamento */}
        <div className="flex flex-col bg-surface-muted rounded-2xl p-4 border border-border shadow-sm">
          <div className="flex items-center gap-2 mb-4 px-2">
            <div className="w-2.5 h-2.5 rounded-full bg-status-progress-bg" />
            <h2 className="font-bold text-text">Em Andamento ({emAndamento.length})</h2>
          </div>
          <div className="flex flex-col gap-3 overflow-y-auto max-h-[70vh] pb-4">
            {emAndamento.length === 0 ? (
              <p className="text-text-muted text-sm italic p-4 text-center">Nenhum chamado em andamento.</p>
            ) : (
              emAndamento.map(chamado => (
                <ChamadoCard
                  key={chamado.id}
                  chamado={chamado}
                  onClick={() => setChamadoSelecionado(chamado)}
                  unreadCount={contadoresNaoLidos[chamado.id] || 0}
                />
              ))
            )}
          </div>
        </div>

        {/* Coluna Concluídos (Recentemente) */}
        <div className="flex flex-col bg-surface-muted rounded-2xl p-4 border border-border shadow-sm">
          <div className="flex items-center gap-2 mb-4 px-2">
            <div className="w-2.5 h-2.5 rounded-full bg-status-completed-bg" />
            <h2 className="font-bold text-text">Recentes (Hoje)</h2>
          </div>
          <div className="flex flex-col gap-3 overflow-y-auto max-h-[70vh] pb-4">
            {concluidos.length === 0 ? (
              <p className="text-text-muted text-sm italic p-4 text-center">Os chamados concluídos somem da fila principal e vão para os relatórios.</p>
            ) : (
              concluidos.map(chamado => (
                <ChamadoCard
                  key={chamado.id}
                  chamado={chamado}
                  onClick={() => setChamadoSelecionado(chamado)}
                  unreadCount={contadoresNaoLidos[chamado.id] || 0}
                />
              ))
            )}
          </div>
        </div>

      </div>

      {/* Modal de Detalhes com Chat */}
      {chamadoSelecionado && (
        <ChamadoModal 
          chamado={chamadoSelecionado}
          onClose={() => setChamadoSelecionado(null)}
          onAssumir={handleAssumir}
          onConcluir={handleConcluir}
          onDelete={handleDelete}
          unreadCount={contadoresNaoLidos[chamadoSelecionado.id] || 0}
          onUnreadCleared={() => handleUnreadCleared(chamadoSelecionado.id)}
        />
      )}
    </div>
  );
}
