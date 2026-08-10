import React from 'react';
import { SurfaceCard } from '@/components/ui/SurfaceCard';

type CategoryVariant = 'disponivel' | 'em-breve' | 'administrativo';

interface CategoryCardProps {
  title: string;
  onClick?: () => void;
  icon?: React.ReactNode;
  variant?: CategoryVariant;
}

export default function CategoryCard({ 
  title, 
  onClick, 
  icon, 
  variant = 'disponivel' 
}: CategoryCardProps) {
  
  const isBlocked = variant === 'em-breve';
  const isAdmin = variant === 'administrativo';

  return (
    <SurfaceCard
      level={isBlocked ? 1 : 2}
      interactive={!isBlocked}
      onClick={isBlocked ? undefined : onClick}
      className={`
        relative flex flex-col items-center justify-center p-8 w-full group
        ${isBlocked ? 'opacity-80 cursor-not-allowed bg-canvas' : ''}
        ${isAdmin ? 'border-brand-500/20 bg-brand-50/10' : ''}
      `}
    >
      {/* Container do Ícone */}
      <div className={`
        relative w-16 h-16 flex items-center justify-center rounded-2xl mb-4 transition-colors duration-300
        ${isAdmin ? 'bg-brand-50 text-brand-600 group-hover:bg-brand-500 group-hover:text-white' : ''}
        ${isBlocked ? 'bg-surface-muted text-text-muted' : ''}
        ${!isAdmin && !isBlocked ? 'bg-brand-50 text-brand-600 group-hover:bg-brand-500 group-hover:text-white' : ''}
      `}>
        {icon || (
          // Ícone Genérico
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
          </svg>
        )}
      </div>

      {/* Texto */}
      <span className={`
        text-lg font-bold transition-colors duration-300
        ${isBlocked ? 'text-text-muted' : 'text-text group-hover:text-brand-600'}
      `}>
        {title}
      </span>

      {isBlocked && (
        <span className="absolute top-4 right-4 bg-surface-muted text-text-subtle text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider">
          Em Breve
        </span>
      )}
    </SurfaceCard>
  );
}
