import React from 'react';

export type StatusType = 'Pendente' | 'Em Andamento' | 'Concluído';

interface StatusBadgeProps {
  status: StatusType | string;
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const getStatusStyles = (s: string) => {
    switch (s) {
      case 'Pendente':
        return 'bg-status-pending-bg text-status-pending-text border-amber-200/50';
      case 'Em Andamento':
        return 'bg-status-progress-bg text-status-progress-text border-blue-200/50';
      case 'Concluído':
        return 'bg-status-completed-bg text-status-completed-text border-emerald-200/50';
      default:
        return 'bg-surface-muted text-text-muted border-border';
    }
  };

  const getStatusIcon = (s: string) => {
    switch (s) {
      case 'Pendente':
        return (
          <span className="w-1.5 h-1.5 rounded-full bg-status-pending animate-pulse mr-1.5" />
        );
      case 'Em Andamento':
        return (
          <span className="w-1.5 h-1.5 rounded-full bg-status-progress animate-pulse mr-1.5" />
        );
      case 'Concluído':
        return (
          <span className="w-1.5 h-1.5 rounded-full bg-status-completed mr-1.5" />
        );
      default:
        return null;
    }
  };

  return (
    <span 
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border transition-colors ${getStatusStyles(status)} ${className}`}
    >
      {getStatusIcon(status)}
      {status}
    </span>
  );
}
