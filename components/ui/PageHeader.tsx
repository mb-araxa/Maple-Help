import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  backButton?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, backButton, actions, className = '' }: PageHeaderProps) {
  return (
    <div className={`flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8 ${className}`}>
      <div className="flex items-start gap-4">
        {backButton && (
          <div className="mt-1">
            {backButton}
          </div>
        )}
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-text">
            {title}
          </h1>
          {description && (
            <p className="mt-2 text-text-muted text-sm md:text-base max-w-2xl">
              {description}
            </p>
          )}
        </div>
      </div>
      
      {actions && (
        <div className="flex items-center gap-3 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
