'use client';

import { useEffect, useState } from 'react';
import { obterMinhaAvaliacao, registrarAvaliacao } from '@/app/actions/chamados';
import { useToast } from '@/components/ToastProvider';
import { Button } from '@/components/ui/Button';
import { AvaliacaoChamado as AvaliacaoChamadoData } from '@/types/database';

interface AvaliacaoChamadoProps {
  chamadoId: string;
}

export function AvaliacaoChamado({ chamadoId }: AvaliacaoChamadoProps) {
  const { addToast } = useToast();
  const [avaliacao, setAvaliacao] = useState<AvaliacaoChamadoData | null>(null);
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    obterMinhaAvaliacao(chamadoId)
      .then((resultado) => setAvaliacao(resultado))
      .catch((error) => console.error('Erro ao carregar avaliacao:', error));
  }, [chamadoId]);

  async function enviarAvaliacao() {
    if (!nota) {
      addToast('Selecione de 1 a 5 estrelas para enviar sua avaliacao.', 'warning');
      return;
    }

    setEnviando(true);
    try {
      const resultado = await registrarAvaliacao(chamadoId, nota, comentario);
      setAvaliacao(resultado);
      addToast('Obrigado pela sua avaliacao!', 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Nao foi possivel enviar a avaliacao.', 'error');
    } finally {
      setEnviando(false);
    }
  }

  if (avaliacao) {
    return (
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-bold text-amber-800">Avaliacao enviada</p>
        <p className="mt-1 text-sm text-amber-800/90">
          {'★'.repeat(avaliacao.nota)} <span className="ml-2">{avaliacao.nota} de 5</span>
        </p>
        {avaliacao.comentario && <p className="mt-2 text-sm text-amber-800/90">{avaliacao.comentario}</p>}
      </div>
    );
  }

  return (
    <section className="mt-4 rounded-xl border border-border bg-surface-muted p-4" aria-labelledby={`avaliacao-${chamadoId}`}>
      <h4 id={`avaliacao-${chamadoId}`} className="text-sm font-bold text-text">Como foi o atendimento?</h4>
      <p className="mt-1 text-sm text-text-muted">Sua opiniao ajuda a melhorar o suporte.</p>
      <div className="mt-3 flex gap-1" role="group" aria-label="Nota do atendimento">
        {[1, 2, 3, 4, 5].map((valor) => (
          <button
            key={valor}
            type="button"
            onClick={() => setNota(valor)}
            aria-label={`${valor} ${valor === 1 ? 'estrela' : 'estrelas'}`}
            aria-pressed={nota === valor}
            className={`rounded-lg p-1 text-3xl leading-none transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/50 ${valor <= nota ? 'text-amber-400' : 'text-zinc-300 hover:text-amber-300'}`}
          >
            ★
          </button>
        ))}
      </div>
      <label className="mt-4 block text-sm font-medium text-text" htmlFor={`comentario-${chamadoId}`}>Comentario (opcional)</label>
      <textarea
        id={`comentario-${chamadoId}`}
        value={comentario}
        onChange={(event) => setComentario(event.target.value)}
        maxLength={500}
        rows={3}
        placeholder="Conte rapidamente como foi sua experiencia."
        className="mt-1 w-full resize-y rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-text-subtle">{comentario.length}/500</span>
        <Button type="button" onClick={enviarAvaliacao} isLoading={enviando} className="px-4 py-2 text-sm">Enviar avaliacao</Button>
      </div>
    </section>
  );
}
