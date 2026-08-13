'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// ─── Tipos ───────────────────────────────────────────────
type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextType {
  addToast: (message: string, variant?: ToastVariant) => void;
  clearToasts: () => void;
}

// ─── Context ─────────────────────────────────────────────
const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast deve ser usado dentro de <ToastProvider>');
  return ctx;
}

// ─── Estilos por variante ────────────────────────────────
const variantStyles: Record<ToastVariant, { bg: string; border: string; icon: string; text: string }> = {
  success: {
    bg: 'bg-status-completed-bg',
    border: 'border-emerald-200',
    icon: '✓',
    text: 'text-status-completed-text',
  },
  error: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: '✕',
    text: 'text-red-800',
  },
  warning: {
    bg: 'bg-status-pending-bg',
    border: 'border-amber-200',
    icon: '⚠',
    text: 'text-status-pending-text',
  },
  info: {
    bg: 'bg-status-progress-bg',
    border: 'border-blue-200',
    icon: 'ℹ',
    text: 'text-status-progress-text',
  },
};

const iconBgStyles: Record<ToastVariant, string> = {
  success: 'bg-status-completed',
  error: 'bg-status-danger',
  warning: 'bg-status-pending',
  info: 'bg-status-progress',
};

// ─── Provider ────────────────────────────────────────────
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setToasts(prev => [...prev, { id, message, variant }]);

    // Auto-remover após 4 segundos
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, clearToasts }}>
      {children}

      {/* Container de Toasts — canto superior direito */}
      <div className="fixed top-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none max-w-sm w-full">
        {toasts.map((toast) => {
          const style = variantStyles[toast.variant];
          return (
            <div
              key={toast.id}
              className={`
                pointer-events-auto flex items-start gap-3 px-4 py-3.5
                ${style.bg} ${style.text} ${style.border}
                border rounded-2xl shadow-lg
                animate-[slideIn_0.3s_ease-out]
              `}
              role="alert"
              aria-live="polite"
            >
              {/* Ícone */}
              <div className={`
                flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold shrink-0 mt-0.5
                ${iconBgStyles[toast.variant]}
              `}>
                {style.icon}
              </div>

              {/* Mensagem */}
              <p className="text-sm font-medium leading-relaxed flex-1">
                {toast.message}
              </p>

              {/* Botão fechar */}
              <button
                onClick={() => removeToast(toast.id)}
                className="shrink-0 opacity-50 hover:opacity-100 transition-opacity mt-0.5"
                aria-label="Fechar notificação"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
