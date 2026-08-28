'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/Button';

interface CompositorMensagemProps {
  onEnviar: (texto: string) => Promise<void>;
  isSending: boolean;
  isConcluido?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

const MAX_CHARS = 2000;

export function CompositorMensagem({
  onEnviar,
  isSending,
  isConcluido = false,
  disabled = false,
  placeholder = 'Escreva sua mensagem... (Enter para enviar, Shift+Enter para nova linha)',
}: CompositorMensagemProps) {
  const [texto, setTexto] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const charCount = texto.length;
  const isOverLimit = charCount > MAX_CHARS;
  const isVazio = !texto.trim();
  const canSend = !isVazio && !isOverLimit && !isSending && !disabled && !isConcluido;

  // Ajuste de altura automático
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [texto]);

  const handleSubmit = async () => {
    if (!canSend) return;
    const mensagemAEnviar = texto.trim();
    setTexto('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    await onEnviar(mensagemAEnviar);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (isConcluido) {
    return (
      <div className="p-4 bg-surface-muted rounded-2xl border border-border text-center text-sm text-text-muted">
        <p className="flex items-center justify-center gap-2 font-medium">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-text-subtle">
            <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
          </svg>
          Este atendimento foi concluído. A conversa está disponível apenas para consulta.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 bg-surface p-3 rounded-2xl border border-border focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20 transition-all">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || isSending}
          placeholder={placeholder}
          rows={1}
          maxLength={MAX_CHARS}
          aria-label="Campo de mensagem do chamado"
          className="w-full bg-transparent text-text placeholder:text-text-subtle outline-none resize-none text-sm py-1.5 px-2 leading-relaxed min-h-[38px] max-h-[160px]"
        />

        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!canSend}
          isLoading={isSending}
          variant="primary"
          className="shrink-0 h-10 w-10 !p-0 rounded-xl flex items-center justify-center"
          aria-label="Enviar mensagem"
        >
          {!isSending && (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
            </svg>
          )}
        </Button>
      </div>

      <div className="flex justify-between items-center px-2 text-[11px] text-text-subtle">
        <span>Pressione Enter para enviar</span>
        <span className={charCount > 1800 ? (isOverLimit ? 'text-status-danger font-bold' : 'text-amber-600') : ''}>
          {charCount}/{MAX_CHARS}
        </span>
      </div>
    </div>
  );
}
