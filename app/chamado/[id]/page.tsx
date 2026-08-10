import { obterChamado, obterEventos, obterMensagens } from '@/app/actions/chamados';
import { getCurrentProfile } from '@/app/actions/auth';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TicketTimeline } from '@/components/TicketTimeline';
import { TicketChat } from '@/components/TicketChat';
import { SurfaceCard } from '@/components/ui/SurfaceCard';

export default async function ChamadoDetailPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params;

  let chamado, eventos, mensagens, profile;
  
  try {
    [chamado, eventos, mensagens, profile] = await Promise.all([
      obterChamado(id),
      obterEventos(id),
      obterMensagens(id),
      getCurrentProfile()
    ]);
  } catch (error) {
    console.error(error);
    return notFound();
  }

  if (!chamado) {
    return notFound();
  }

  return (
    <main className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <PageHeader 
        title="Detalhes do Chamado" 
        description={`Chamado de ${chamado.solicitante}`}
        backButton={<a href="/menu" className="text-sm font-bold text-brand hover:underline">&larr; Voltar</a>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <SurfaceCard level={1} className="p-6">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold text-text">{chamado.categoria}</h2>
              <StatusBadge status={chamado.status} />
            </div>
            <p className="text-text-muted mb-6 whitespace-pre-wrap">{chamado.descricao}</p>
            
            {chamado.anexo_url && (
              <div className="mt-4 pt-4 border-t border-border">
                <h3 className="text-sm font-bold text-text mb-3">Anexo</h3>
                <a href={chamado.anexo_url} target="_blank" rel="noreferrer" className="inline-block rounded-lg overflow-hidden border border-border hover:opacity-90 transition-opacity max-w-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={chamado.anexo_url} alt="Anexo do chamado" className="w-full h-auto object-cover" />
                </a>
              </div>
            )}
          </SurfaceCard>

          <TicketChat 
            chamadoId={id} 
            mensagens={mensagens} 
            currentUser={profile} 
          />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <SurfaceCard level={1} className="p-5">
            <h3 className="font-bold text-text mb-4">Informações</h3>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-text-subtle">Solicitante</dt>
                <dd className="font-medium text-text">{chamado.solicitante}</dd>
              </div>
              <div>
                <dt className="text-text-subtle">Local</dt>
                <dd className="font-medium text-text">{chamado.local}</dd>
              </div>
              <div>
                <dt className="text-text-subtle">Prioridade</dt>
                <dd className="font-medium text-text capitalize">{chamado.priority}</dd>
              </div>
              <div>
                <dt className="text-text-subtle">Área</dt>
                <dd className="font-medium text-text capitalize">{chamado.area}</dd>
              </div>
              <div>
                <dt className="text-text-subtle">Criado em</dt>
                <dd className="font-medium text-text">
                  {new Date(chamado.data_criacao).toLocaleString('pt-BR')}
                </dd>
              </div>
              {chamado.due_at && (
                <div>
                  <dt className="text-text-subtle">Prazo Estimado</dt>
                  <dd className={`font-medium ${new Date(chamado.due_at) < new Date() && chamado.status !== 'Concluído' ? 'text-brand' : 'text-text'}`}>
                    {new Date(chamado.due_at).toLocaleString('pt-BR')}
                  </dd>
                </div>
              )}
              {chamado.responsavel && (
                <div>
                  <dt className="text-text-subtle">Responsável</dt>
                  <dd className="font-medium text-text">{chamado.responsavel}</dd>
                </div>
              )}
            </dl>
          </SurfaceCard>

          <SurfaceCard level={1} className="p-5">
            <h3 className="font-bold text-text mb-4">Linha do Tempo</h3>
            <TicketTimeline eventos={eventos} />
          </SurfaceCard>
        </div>
      </div>
    </main>
  );
}
