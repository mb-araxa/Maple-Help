import { Chamado } from '@/types/database';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface ChamadoCardProps {
  chamado: Chamado;
  onClick: () => void;
}

export function ChamadoCard({ chamado, onClick }: ChamadoCardProps) {
  return (
    <SurfaceCard 
      onClick={onClick}
      level={2}
      interactive
      className="p-4 flex flex-col gap-3 group relative overflow-hidden"
    >
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-bold text-text group-hover:text-brand-500 transition-colors line-clamp-1">
            {chamado.solicitante}
          </h3>
          <p className="text-xs text-text-muted font-medium mt-0.5">{chamado.local}</p>
        </div>
        
        {chamado.responsavel && chamado.status === 'Em Andamento' && (
          <div className="flex items-center gap-1 bg-status-progress-bg text-status-progress-text px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border border-blue-200/50 shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-5.5-2.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM10 12a5.99 5.99 0 00-4.793 2.39A6.483 6.483 0 0010 16.5a6.483 6.483 0 004.793-2.11A5.99 5.99 0 0010 12z" clipRule="evenodd" />
            </svg>
            {chamado.responsavel}
          </div>
        )}
      </div>
      
      <div className="flex flex-wrap gap-2 items-center">
        <StatusBadge status={chamado.status} />
        <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-surface-muted text-text border border-border">
          {chamado.categoria}
        </span>
        <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
          chamado.priority === 'critica' ? 'bg-red-50 text-brand border-brand/20' :
          chamado.priority === 'alta' ? 'bg-orange-50 text-orange-600 border-orange-200' :
          chamado.priority === 'baixa' ? 'bg-green-50 text-green-600 border-green-200' :
          'bg-blue-50 text-blue-600 border-blue-200'
        }`}>
          {chamado.priority}
        </span>
        <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
          {chamado.area}
        </span>
      </div>

      <div className="mt-1">
        <p className="text-sm text-text-muted line-clamp-2 leading-relaxed">
          {chamado.descricao}
        </p>
      </div>
      
      <div className="mt-2 pt-3 border-t border-border flex justify-between items-center text-xs text-text-subtle">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span>Aberto:</span>
            <span className="font-medium text-text-muted">
              {new Date(chamado.data_criacao).toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
              })}
            </span>
          </div>
          {chamado.due_at && chamado.status !== 'Concluído' && chamado.status !== 'Cancelado' && (
            <div className={`flex items-center gap-2 ${new Date(chamado.due_at) < new Date() ? 'text-brand font-bold' : ''}`}>
              <span>Prazo:</span>
              <span className="font-medium">
                {new Date(chamado.due_at).toLocaleString('pt-BR', {
                  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                })}
              </span>
            </div>
          )}
        </div>
      </div>
    </SurfaceCard>
  );
}
