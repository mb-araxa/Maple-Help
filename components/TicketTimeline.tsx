import { ChamadoEvento } from '@/types/database';

export function TicketTimeline({ eventos }: { eventos: ChamadoEvento[] }) {
  if (!eventos || eventos.length === 0) {
    return <p className="text-sm text-text-subtle">Nenhum evento registrado.</p>;
  }

  return (
    <div className="relative pl-4 space-y-4 before:absolute before:inset-y-0 before:left-[7px] before:w-px before:bg-border">
      {eventos.map((evento) => (
        <div key={evento.id} className="relative text-sm">
          <div className="absolute -left-[21px] mt-1.5 w-2 h-2 rounded-full bg-brand ring-4 ring-surface" />
          <p className="text-text font-medium">{evento.description}</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-text-subtle">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <span>{(evento as any).profiles?.full_name || 'Sistema'}</span>
            <span>&bull;</span>
            <time>{new Date(evento.created_at).toLocaleString('pt-BR', {
              day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
            })}</time>
          </div>
        </div>
      ))}
    </div>
  );
}
