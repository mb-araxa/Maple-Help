'use client';

import { useEffect, useState } from 'react';
import type { Chamado } from '@/types/database';
import { PRIORIDADE_LABEL, SITUACAO_SLA_LABEL, situacaoSla } from '@/lib/sla';

export function SlaBadge({ chamado }: { chamado: Chamado }) {
  const [agora, setAgora] = useState<number | undefined>();
  useEffect(() => {
    const timer = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const situacao = situacaoSla(chamado, agora);
  const cor = situacao === 'atrasado' || situacao === 'violado'
    ? 'bg-red-50 text-red-800 border-red-200'
    : situacao === 'proximo' ? 'bg-amber-50 text-amber-900 border-amber-200'
    : situacao === 'sem_sla' ? 'bg-surface-muted text-text-muted border-border'
    : 'bg-emerald-50 text-emerald-800 border-emerald-200';
  return (
    <div className="space-y-1 text-xs">
      <div className="flex flex-wrap gap-2 items-center">
        {chamado.prioridade && <span className="font-semibold">Prioridade {PRIORIDADE_LABEL[chamado.prioridade]}</span>}
        <span className={`rounded-lg border px-2 py-1 font-semibold ${cor}`}>{SITUACAO_SLA_LABEL[situacao]}</span>
        {chamado.origem === 'email' && <span className="text-text-muted">Via e-mail</span>}
      </div>
      {chamado.sla_vence_em && <p className="text-text-muted">
        Prazo: {new Date(chamado.sla_vence_em).toLocaleString('pt-BR')} ({chamado.sla_prazo_horas}h corridas)
      </p>}
    </div>
  );
}
