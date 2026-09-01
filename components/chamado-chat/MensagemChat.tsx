'use client';

import { ChamadoMensagem } from '@/types/database';

export interface MensagemChatProps {
  mensagem: ChamadoMensagem;
  isPropria: boolean;
  responsavel?: string | null;
  statusEnvio?: 'sending' | 'sent' | 'error';
  onRetry?: () => void;
}

export function MensagemChat({
  mensagem,
  isPropria,
  responsavel,
  statusEnvio = 'sent',
  onRetry,
}: MensagemChatProps) {
  const dataFormatada = new Date(mensagem.created_at).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const isTI = mensagem.autor_tipo === 'ti';

  const nomeResponsavel = responsavel?.trim();
  const autorNomeNormalizado = mensagem.autor_nome?.trim();

  const nomeExibido = isPropria
    ? 'Você'
    : isTI
      ? nomeResponsavel || (autorNomeNormalizado && autorNomeNormalizado !== 'Equipe de TI' ? autorNomeNormalizado : 'Equipe de TI')
      : autorNomeNormalizado || 'Solicitante';

  return (
    <div
      className={`flex flex-col gap-1 w-full max-w-[85%] sm:max-w-[75%] ${
        isPropria ? 'ml-auto items-end' : 'mr-auto items-start'
      }`}
    >
      {/* Cabeçalho do autor */}
      <div className="flex items-center gap-2 px-1 text-xs text-text-muted">
        <span className="font-semibold text-text">
          {nomeExibido}
        </span>
        
        {isTI ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold tracking-wide uppercase border border-blue-200/60">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
              <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
            </svg>
            TI
          </span>
        ) : (
          !isPropria && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-700 text-[10px] font-medium">
              Solicitante
            </span>
          )
        )}
      </div>

      {/* Bolha de mensagem */}
      <div
        className={`p-3.5 rounded-2xl shadow-sm text-sm break-words whitespace-pre-wrap leading-relaxed relative ${
          isPropria
            ? 'bg-brand-500 text-white rounded-tr-none'
            : 'bg-surface-muted text-text border border-border rounded-tl-none'
        } ${statusEnvio === 'sending' ? 'opacity-70' : ''} ${
          statusEnvio === 'error' ? 'border-status-danger ring-2 ring-status-danger/30' : ''
        }`}
      >
        <p>{mensagem.mensagem}</p>
      </div>

      {/* Rodapé: Horário e Status */}
      <div className="flex items-center gap-2 px-1 text-[11px] text-text-subtle">
        <span>{dataFormatada}</span>

        {statusEnvio === 'sending' && (
          <span className="flex items-center gap-1 text-text-muted italic">
            <svg className="animate-spin w-3 h-3 text-text-muted" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            Enviando...
          </span>
        )}

        {statusEnvio === 'error' && (
          <div className="flex items-center gap-2 text-status-danger font-medium">
            <span>Falha no envio</span>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="underline hover:text-red-700 cursor-pointer font-bold"
              >
                Tentar novamente
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
