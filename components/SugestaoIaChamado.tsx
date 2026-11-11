'use client';

import React, { useEffect, useState } from 'react';
import type { ChamadoAdmin, StatusAnaliseIa } from '@/types/database';
import { PRIORIDADE_LABEL } from '@/lib/sla';
import { gerarSugestaoIaChamado } from '@/app/actions/chamados';

export function isTravaIaAtiva(
  iaStatus?: StatusAnaliseIa | null,
  iaTravaAte?: string | null,
  agoraMs: number = Date.now()
): boolean {
  if (iaStatus !== 'processando') return false;
  if (!iaTravaAte) return false;
  const limiteMs = Date.parse(iaTravaAte);
  if (Number.isNaN(limiteMs)) return false;
  return limiteMs > agoraMs;
}

export function isTravaIaExpirada(
  iaStatus?: StatusAnaliseIa | null,
  iaTravaAte?: string | null,
  agoraMs: number = Date.now()
): boolean {
  if (iaStatus !== 'processando') return false;
  return !isTravaIaAtiva(iaStatus, iaTravaAte, agoraMs);
}

export interface SugestaoIaChamadoProps {
  chamado: ChamadoAdmin;
  onChamadoAtualizado?: (chamado: ChamadoAdmin) => void;
  onGerarSugestao?: (chamadoId: string) => Promise<ChamadoAdmin | void>;
}

export function SugestaoIaChamado({
  chamado,
  onChamadoAtualizado,
  onGerarSugestao,
}: SugestaoIaChamadoProps) {
  const [processandoLocal, setProcessandoLocal] = useState(false);
  const [erroLocal, setErroLocal] = useState(false);
  const [agoraMs, setAgoraMs] = useState<number | undefined>();

  useEffect(() => {
    if (chamado.ia_status !== 'processando' || !chamado.ia_trava_ate) return;
    const limiteMs = Date.parse(chamado.ia_trava_ate);
    if (Number.isNaN(limiteMs)) return;
    const restanteMs = limiteMs - Date.now();
    if (restanteMs <= 0) return;

    const timer = setTimeout(() => {
      setAgoraMs(Date.now());
    }, restanteMs + 50);

    return () => clearTimeout(timer);
  }, [chamado.ia_status, chamado.ia_trava_ate]);

  // Nunca exibir nos chamados Concluídos
  if (chamado.status === 'Concluído') {
    return null;
  }

  const statusBanco: StatusAnaliseIa = chamado.ia_status ?? 'pendente';
  const travaBancoAtiva = isTravaIaAtiva(statusBanco, chamado.ia_trava_ate, agoraMs);
  const travaBancoExpirada = isTravaIaExpirada(statusBanco, chamado.ia_trava_ate, agoraMs);

  const estaProcessando = processandoLocal || travaBancoAtiva;
  const temSugestaoConcluida =
    statusBanco === 'concluida' && Boolean(chamado.ia_sugestao_atendimento);
  const estaEmFalha = erroLocal || statusBanco === 'falha' || travaBancoExpirada;

  const handleAcionarIa = async () => {
    if (estaProcessando) return;
    setProcessandoLocal(true);
    setErroLocal(false);

    try {
      const resultado = onGerarSugestao
        ? await onGerarSugestao(chamado.id)
        : await gerarSugestaoIaChamado(chamado.id);

      if (resultado) {
        onChamadoAtualizado?.(resultado);
        if (resultado.ia_status === 'falha') {
          setErroLocal(true);
        }
      }
    } catch {
      setErroLocal(true);
    } finally {
      setProcessandoLocal(false);
    }
  };

  const prioridadeSugeridaLabel = chamado.ia_prioridade_sugerida
    ? PRIORIDADE_LABEL[chamado.ia_prioridade_sugerida]
    : null;

  return (
    <section
      aria-labelledby="assistente-ia-titulo"
      className="bg-surface-muted p-4 rounded-2xl border border-border space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-brand-500/10 text-brand-600 font-bold text-xs"
          >
            IA
          </span>
          <h3 id="assistente-ia-titulo" className="text-sm font-bold text-text">
            Assistente de atendimento
          </h3>
        </div>

        {chamado.prioridade_origem === 'ia' && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            Prioridade definida pela IA
          </span>
        )}

        {chamado.prioridade_origem === 'manual' && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200">
              Prioridade alterada manualmente
            </span>
            {prioridadeSugeridaLabel && (
              <span className="text-xs text-text-muted font-medium">
                (A IA havia sugerido {prioridadeSugeridaLabel})
              </span>
            )}
          </div>
        )}
      </div>

      {estaProcessando ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-2">
          <div role="status" aria-live="polite" className="flex items-center gap-2.5 text-sm text-text-muted">
            <svg
              className="animate-spin h-4 w-4 text-brand-500 shrink-0"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Analisando o chamado...</span>
          </div>

          <button
            type="button"
            disabled
            aria-busy="true"
            className="inline-flex items-center justify-center rounded-xl px-3.5 py-2 text-xs font-bold bg-surface border border-border text-text-muted opacity-50 cursor-not-allowed"
          >
            {estaEmFalha ? 'Tentar novamente' : 'Gerar sugestão com IA'}
          </button>
        </div>
      ) : estaEmFalha ? (
        <div className="space-y-3">
          <div
            role="alert"
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-red-50/70 border border-red-200 rounded-xl p-3"
          >
            <p className="text-sm text-red-800 font-medium">
              {travaBancoExpirada && !erroLocal
                ? 'O processamento anterior expirou. Você pode tentar novamente.'
                : 'Não foi possível gerar a sugestão neste momento.'}
            </p>
            <button
              type="button"
              onClick={handleAcionarIa}
              disabled={estaProcessando}
              className="inline-flex items-center justify-center rounded-xl px-3.5 py-2 text-xs font-bold bg-surface border border-red-200 text-red-800 hover:bg-red-100/60 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              Tentar novamente
            </button>
          </div>

          {chamado.ia_sugestao_atendimento && (
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex flex-wrap gap-2 text-xs">
                {prioridadeSugeridaLabel && (
                  <span className="font-semibold text-text">
                    Prioridade sugerida: {prioridadeSugeridaLabel}
                  </span>
                )}
                {typeof chamado.ia_confianca === 'number' && (
                  <span className="text-text-muted">Confiança: {chamado.ia_confianca}%</span>
                )}
              </div>
              {chamado.ia_justificativa && (
                <p className="text-xs text-text-muted">{chamado.ia_justificativa}</p>
              )}
              <p className="text-sm text-text whitespace-pre-wrap leading-relaxed">
                {chamado.ia_sugestao_atendimento}
              </p>
              <p className="text-xs text-text-subtle italic">
                A sugestão é um apoio à equipe e deve ser confirmada pelo técnico.
              </p>
            </div>
          )}
        </div>
      ) : temSugestaoConcluida ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {prioridadeSugeridaLabel && (
              <span className="px-2.5 py-1 rounded-lg bg-surface border border-border font-semibold text-text">
                Prioridade sugerida: {prioridadeSugeridaLabel}
              </span>
            )}
            {typeof chamado.ia_confianca === 'number' && (
              <span className="px-2.5 py-1 rounded-lg bg-surface border border-border font-medium text-text-muted">
                Confiança: {chamado.ia_confianca}%
              </span>
            )}
          </div>

          {chamado.ia_justificativa && (
            <div>
              <p className="text-xs text-text-subtle font-semibold uppercase tracking-wider mb-1">
                Justificativa da triagem
              </p>
              <p className="text-sm text-text-muted leading-relaxed">{chamado.ia_justificativa}</p>
            </div>
          )}

          <div className="bg-surface p-3.5 rounded-xl border border-border">
            <p className="text-xs text-text-subtle font-semibold uppercase tracking-wider mb-1.5">
              Sugestão de atendimento / possível solução
            </p>
            <p className="text-sm text-text whitespace-pre-wrap leading-relaxed">
              {chamado.ia_sugestao_atendimento}
            </p>
          </div>

          <p className="text-xs text-text-subtle italic">
            A sugestão é um apoio à equipe e deve ser confirmada pelo técnico.
          </p>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-1">
          <p className="text-sm text-text-muted">Sugestão ainda não gerada.</p>
          <button
            type="button"
            onClick={handleAcionarIa}
            disabled={estaProcessando}
            className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-xs font-bold bg-brand-500 text-white hover:bg-brand-600 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            Gerar sugestão com IA
          </button>
        </div>
      )}
    </section>
  );
}
