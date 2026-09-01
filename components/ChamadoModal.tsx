'use client';

import { Chamado } from '@/types/database';
import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { ConfirmModal } from './ConfirmModal';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { FormField } from '@/components/ui/FormField';
import { ChamadoChat } from '@/components/chamado-chat/ChamadoChat';
import { IndicadorNaoLidas } from '@/components/chamado-chat/IndicadorNaoLidas';

interface ChamadoModalProps {
  chamado: Chamado;
  onClose: () => void;
  onAssumir: (id: string) => Promise<void>;
  onConcluir: (id: string, resolucao: string, tempo_gasto: string) => Promise<void>;
  onDelete?: (id: string) => void;
  unreadCount?: number;
  onUnreadCleared?: () => void;
}

export function ChamadoModal({
  chamado,
  onClose,
  onAssumir,
  onConcluir,
  onDelete,
  unreadCount = 0,
  onUnreadCleared,
}: ChamadoModalProps) {
  const [activeTab, setActiveTab] = useState<'detalhes' | 'conversa'>('detalhes');
  const [resolucao, setResolucao] = useState('');
  const [tempoGasto, setTempoGasto] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [tempoError, setTempoError] = useState(false);
  const [resolucaoError, setResolucaoError] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDeleteConfirm) {
          setShowDeleteConfirm(false);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    modalRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose, showDeleteConfirm]);

  const handleAssumir = async () => {
    setLoading(true);
    await onAssumir(chamado.id);
    setLoading(false);
  };

  const handleConcluir = async () => {
    let hasError = false;

    if (!tempoGasto.trim()) {
      setTempoError(true);
      setTimeout(() => setTempoError(false), 2000);
      hasError = true;
    }

    if (!resolucao.trim()) {
      setResolucaoError(true);
      setTimeout(() => setResolucaoError(false), 2000);
      hasError = true;
    }

    if (hasError) return;

    setLoading(true);
    await onConcluir(chamado.id, resolucao, tempoGasto);
    setLoading(false);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm transition-all"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chamado-modal-title"
      >
        <div
          ref={modalRef}
          tabIndex={-1}
          className="bg-surface w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] outline-none"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header do Modal */}
          <div className="px-6 py-4 border-b border-border flex justify-between items-center bg-surface-muted">
            <div className="flex items-center gap-3">
              <StatusBadge status={chamado.status} />
              <h2 id="chamado-modal-title" className="text-lg font-bold text-text">Chamado #{chamado.id.slice(0, 8)}</h2>
              
              {chamado.responsavel && (
                <span className="ml-2 flex items-center gap-1.5 px-3 py-1 bg-surface text-text-muted rounded-lg text-xs font-semibold border border-border">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 opacity-70">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-5.5-2.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM10 12a5.99 5.99 0 00-4.793 2.39A6.483 6.483 0 0010 16.5a6.483 6.483 0 004.793-2.11A5.99 5.99 0 0010 12z" clipRule="evenodd" />
                  </svg>
                  Atendido por: {chamado.responsavel}
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              {onDelete && (
                <button 
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-2 text-text-subtle hover:text-status-danger hover:bg-red-50 rounded-full transition-colors flex-shrink-0"
                  title="Apagar Chamado de Teste"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.158 0c-.36-.05-.72-.109-1.08-.166m-1.08-.166V4.41a2.25 2.25 0 00-2.25-2.25h-5.62a2.25 2.25 0 00-2.25 2.25v.38m10.8 0c-.36-.05-.72-.109-1.08-.166M7.5 5.79c.36-.05.72-.109 1.08-.166M7.5 5.79c-.36.05-.72.109-1.08.166M4.772 5.79c-.342.052-.682.107-1.022.166" />
                  </svg>
                </button>
              )}
              
              <button 
                onClick={onClose}
                className="p-2 text-text-subtle hover:text-text hover:bg-surface-muted rounded-full transition-colors flex-shrink-0"
                aria-label="Fechar modal"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Abas de Navegação */}
          <div className="px-6 border-b border-border bg-surface flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('detalhes')}
              className={`py-3 px-4 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                activeTab === 'detalhes'
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-text-muted hover:text-text'
              }`}
            >
              Detalhes
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('conversa')}
              className={`py-3 px-4 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
                activeTab === 'conversa'
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-text-muted hover:text-text'
              }`}
            >
              <span>Conversa</span>
              <IndicadorNaoLidas count={unreadCount} size="sm" />
            </button>
          </div>

          {/* Conteúdo da Aba Ativa */}
          {activeTab === 'conversa' ? (
            <div className="p-6 overflow-y-auto flex-1 flex flex-col">
              <ChamadoChat
                chamadoId={chamado.id}
                status={chamado.status}
                responsavel={chamado.responsavel}
                isAdm={true}
                onUnreadCleared={onUnreadCleared}
              />
            </div>
          ) : (
            <div className="p-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <p className="text-xs text-text-subtle font-semibold uppercase tracking-wider mb-1">Solicitante</p>
                  <p className="text-text font-medium">{chamado.solicitante}</p>
                </div>
                <div>
                  <p className="text-xs text-text-subtle font-semibold uppercase tracking-wider mb-1">Local</p>
                  <p className="text-text font-medium">{chamado.local}</p>
                </div>
                <div>
                  <p className="text-xs text-text-subtle font-semibold uppercase tracking-wider mb-1">Categoria</p>
                  <p className="text-text font-medium">{chamado.categoria}</p>
                </div>
                <div>
                  <p className="text-xs text-text-subtle font-semibold uppercase tracking-wider mb-1">Data de Abertura</p>
                  <p className="text-text font-medium">
                    {new Date(chamado.data_criacao).toLocaleString('pt-BR', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>

              <div className="bg-surface-muted p-4 rounded-2xl border border-border">
                <p className="text-xs text-text-subtle font-semibold uppercase tracking-wider mb-2">Descrição do Problema</p>
                <p className="text-text whitespace-pre-wrap leading-relaxed">{chamado.descricao}</p>
                
                {chamado.anexo_url && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-xs text-text-subtle font-semibold uppercase tracking-wider mb-2">Anexo</p>
                    <a href={chamado.anexo_url} target="_blank" rel="noopener noreferrer" className="block max-w-sm rounded-lg overflow-hidden border border-border shadow-sm hover:shadow-md transition-shadow relative h-64 w-full">
                      <Image 
                        src={chamado.anexo_url} 
                        alt="Anexo do Chamado" 
                        fill
                        className="object-cover"
                        unoptimized={true}
                      />
                    </a>
                  </div>
                )}
              </div>

              {chamado.status === 'Em Andamento' && (
                <div className="mt-6 animate-in fade-in slide-in-from-bottom-2 space-y-4">
                  <FormField
                    label="Tempo Gasto"
                    htmlFor="tempo-input"
                    required
                    error={tempoError ? 'Preenchimento obrigatório' : undefined}
                  >
                    <input
                      id="tempo-input"
                      type="text"
                      value={tempoGasto}
                      onChange={(e) => setTempoGasto(e.target.value)}
                      placeholder="Ex: 30m, 1h 20m..."
                      className={`w-full p-3 bg-surface border rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all ${
                        tempoError ? 'border-status-danger ring-2 ring-status-danger/50' : 'border-border'
                      }`}
                    />
                  </FormField>
                  
                  <FormField
                    label="Notas de Resolução"
                    htmlFor="resolucao-textarea"
                    required
                    error={resolucaoError ? 'Preenchimento obrigatório' : undefined}
                  >
                    <textarea
                      id="resolucao-textarea"
                      value={resolucao}
                      onChange={(e) => setResolucao(e.target.value)}
                      placeholder="Descreva o que foi feito para resolver o problema..."
                      className={`w-full p-4 bg-surface border rounded-2xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all resize-none min-h-[120px] ${
                        resolucaoError ? 'border-status-danger ring-2 ring-status-danger/50' : 'border-border'
                      }`}
                    />
                  </FormField>
                </div>
              )}

              {chamado.status === 'Concluído' && chamado.resolucao && (
                <div className="mt-6 bg-status-completed-bg p-4 rounded-2xl border border-emerald-200/50">
                  <p className="text-xs text-status-completed-text font-semibold uppercase tracking-wider mb-2">Solução Aplicada</p>
                  <p className="text-status-completed-text whitespace-pre-wrap">{chamado.resolucao}</p>
                  <div className="flex items-center gap-4 mt-3 border-t border-emerald-200/30 pt-2 text-xs text-status-completed-text font-medium">
                    {chamado.data_resolucao && (
                      <p>
                        Resolvido em: {new Date(chamado.data_resolucao).toLocaleString('pt-BR', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </p>
                    )}
                    {chamado.tempo_gasto && (
                      <p>
                        • Tempo gasto: {chamado.tempo_gasto}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Rodapé de Ações */}
          {(chamado.status === 'Pendente' || chamado.status === 'Em Andamento') && (
            <div className="px-6 py-4 border-t border-border bg-surface-muted flex justify-end gap-3">
              <Button
                onClick={onClose}
                variant="secondary"
              >
                Cancelar
              </Button>
              
              {chamado.status === 'Pendente' && (
                <Button
                  onClick={handleAssumir}
                  isLoading={loading}
                  variant="primary"
                >
                  Assumir Chamado
                </Button>
              )}

              {chamado.status === 'Em Andamento' && (
                <Button
                  onClick={handleConcluir}
                  isLoading={loading}
                  variant="success"
                >
                  Concluir Chamado
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {showDeleteConfirm && (
        <ConfirmModal
          title="Apagar Chamado"
          message="Tem certeza que deseja apagar este chamado? Esta ação não pode ser desfeita."
          confirmLabel="Apagar"
          cancelLabel="Cancelar"
          variant="danger"
          onConfirm={() => {
            setShowDeleteConfirm(false);
            onDelete?.(chamado.id);
          }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  );
}
