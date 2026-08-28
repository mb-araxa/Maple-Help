'use client';

interface IndicadorNaoLidasProps {
  count: number;
  className?: string;
  size?: 'sm' | 'md';
}

export function IndicadorNaoLidas({ count, className = '', size = 'md' }: IndicadorNaoLidasProps) {
  if (count <= 0) return null;

  const displayCount = count > 99 ? '99+' : count.toString();
  const sizeClasses = size === 'sm' 
    ? 'px-1.5 py-0.5 text-[10px] min-w-[18px] h-[18px]' 
    : 'px-2 py-0.5 text-xs min-w-[22px] h-[22px]';

  return (
    <span
      role="status"
      aria-label={`${count} ${count === 1 ? 'mensagem não lida' : 'mensagens não lidas'}`}
      className={`inline-flex items-center justify-center font-bold text-white bg-brand-500 rounded-full shadow-sm animate-in fade-in zoom-in-75 duration-200 ${sizeClasses} ${className}`}
    >
      {displayCount}
    </span>
  );
}
