import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', isLoading, children, disabled, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-bold transition-all focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed';
    
    // Default rounded-xl as per phase 1.4 rules for buttons
    const roundedStyles = 'rounded-xl px-5 py-3'; 
    
    const variants: Record<ButtonVariant, string> = {
      primary: 'bg-brand-500 text-white hover:bg-brand-600 focus:ring-2 focus:ring-brand-500/50 shadow-sm hover:shadow',
      secondary: 'bg-white border border-border text-text hover:bg-surface-muted hover:border-zinc-300 focus:ring-2 focus:ring-zinc-200 shadow-sm',
      ghost: 'bg-transparent text-text hover:bg-surface-muted focus:ring-2 focus:ring-zinc-200',
      danger: 'bg-status-danger text-white hover:bg-red-700 focus:ring-2 focus:ring-red-600/50 shadow-sm hover:shadow',
      success: 'bg-status-completed text-white hover:bg-emerald-600 focus:ring-2 focus:ring-emerald-500/50 shadow-sm hover:shadow',
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${roundedStyles} ${variants[variant]} ${className}`}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Aguarde...
          </span>
        ) : (
          children
        )}
      </button>
    );
  }
);
Button.displayName = 'Button';
