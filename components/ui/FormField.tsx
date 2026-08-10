import React from 'react';

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  helpText?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormField({ 
  label, 
  htmlFor, 
  required, 
  error, 
  helpText, 
  children,
  className = ''
}: FormFieldProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label 
        htmlFor={htmlFor} 
        className="block text-sm font-bold text-text mb-0.5"
      >
        {label}
        {required && <span className="text-status-danger ml-1">*</span>}
      </label>
      
      {/* 
        This wrapper is meant to contain inputs/selects/textareas. 
        Any standard HTML input placed inside should ideally have:
        className="w-full px-4 py-3 bg-surface-muted border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white text-text placeholder:text-text-subtle transition-all font-medium"
      */}
      <div className="relative">
        {children}
      </div>

      {error && (
        <p className="text-sm font-medium text-status-danger mt-1">
          {error}
        </p>
      )}

      {helpText && !error && (
        <p className="text-xs text-text-muted mt-1">
          {helpText}
        </p>
      )}
    </div>
  );
}
