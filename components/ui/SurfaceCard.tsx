import React from 'react';

interface SurfaceCardProps extends React.HTMLAttributes<HTMLDivElement> {
  level?: 0 | 1 | 2;
  interactive?: boolean;
}

export const SurfaceCard = React.forwardRef<HTMLDivElement, SurfaceCardProps>(
  ({ className = '', level = 1, interactive = false, children, ...props }, ref) => {
    // Phase 1.3 rules for depth and 1.4 rules for border radius
    
    // Nível 0: superfícies agrupadas; borda discreta; sem sombra
    // Nível 1: cards comuns; sombra muito suave (shadow-sm)
    // Nível 2: cards clicáveis; cabeçalhos flutuantes; hover de elementos interativos (shadow-md)
    
    // Cards padrão: rounded-2xl
    
    const baseStyles = 'bg-surface border border-border rounded-2xl transition-all';
    
    const levelStyles = {
      0: 'shadow-none',
      1: 'shadow-sm',
      2: 'shadow-md',
    };
    
    const interactiveStyles = interactive 
      ? 'hover:shadow-md hover:-translate-y-0.5 hover:border-zinc-300 cursor-pointer' 
      : '';

    return (
      <div
        ref={ref}
        className={`${baseStyles} ${levelStyles[level]} ${interactiveStyles} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);
SurfaceCard.displayName = 'SurfaceCard';
