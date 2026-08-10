'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/Button';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Fechar com ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onCancel]);

  // Focus trap: auto-focus o modal ao abrir
  useEffect(() => {
    modalRef.current?.focus();
  }, []);

  const isDanger = variant === 'danger';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="bg-surface w-full max-w-md rounded-3xl shadow-2xl overflow-hidden outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <h3 id="confirm-modal-title" className="text-lg font-bold text-text mb-2">
            {title}
          </h3>
          <p className="text-sm text-text-muted leading-relaxed">
            {message}
          </p>
        </div>
        <div className="px-6 py-4 border-t border-border bg-surface-muted flex justify-end gap-3">
          <Button
            onClick={onCancel}
            variant="secondary"
          >
            {cancelLabel}
          </Button>
          <Button
            onClick={onConfirm}
            variant={isDanger ? 'danger' : 'primary'}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
