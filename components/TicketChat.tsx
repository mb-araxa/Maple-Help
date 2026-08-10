'use client';

import { useState, useRef, useEffect } from 'react';
import { ChamadoMensagem } from '@/types/database';
import { UserProfile } from '@/app/actions/auth';
import { enviarMensagem } from '@/app/actions/chamados';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { useRouter } from 'next/navigation';

export function TicketChat({ 
  chamadoId, 
  mensagens: initialMessages,
  currentUser
}: { 
  chamadoId: string;
  mensagens: ChamadoMensagem[];
  currentUser: UserProfile;
}) {
  const [mensagens, setMensagens] = useState(initialMessages);
  const [newMessage, setNewMessage] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mensagens]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    setIsSubmitting(true);
    try {
      const novaMsg = await enviarMensagem(chamadoId, newMessage, isInternal);
      // add optimistic fake msg to state
      setMensagens(prev => [...prev, {
        ...novaMsg,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        profiles: { full_name: currentUser.full_name, avatar_url: currentUser.avatar_url, role: currentUser.role } as any
      } as ChamadoMensagem]);
      setNewMessage('');
      router.refresh();
    } catch (error: unknown) {
      alert((error as Error).message || 'Erro ao enviar mensagem');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SurfaceCard level={1} className="flex flex-col h-[500px]">
      <div className="p-4 border-b border-border bg-surface-muted">
        <h3 className="font-bold text-text">Mensagens</h3>
      </div>
      
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {mensagens.length === 0 ? (
          <p className="text-sm text-text-subtle text-center py-8">
            Nenhuma mensagem enviada.
          </p>
        ) : (
          mensagens.map(msg => {
            const isMine = msg.author_id === currentUser.id;
            return (
              <div 
                key={msg.id} 
                className={`flex flex-col max-w-[80%] ${isMine ? 'ml-auto items-end' : 'mr-auto items-start'}`}
              >
                <div className="flex items-center gap-2 mb-1 text-xs text-text-subtle">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <span className="font-medium">{(msg as any).profiles?.full_name || 'Usuário'}</span>
                  <time>{new Date(msg.created_at).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time>
                  {msg.is_internal && (
                    <span className="text-[9px] uppercase tracking-wider bg-orange-100 text-orange-700 px-1 rounded font-bold">Interno</span>
                  )}
                </div>
                <div 
                  className={`p-3 rounded-xl text-sm ${
                    msg.is_internal ? 'bg-orange-50 border border-orange-200 text-orange-900' :
                    isMine ? 'bg-brand text-white' : 'bg-surface-muted text-text border border-border'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.message}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="p-4 border-t border-border bg-surface-muted">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <FormField label="" htmlFor="newMessage">
            <textarea
              id="newMessage"
              placeholder="Digite sua mensagem..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-4 py-3 bg-surface-muted border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white text-text placeholder:text-text-subtle transition-all font-medium resize-none h-20"
            />
          </FormField>
          <div className="flex justify-between items-center">
            {currentUser.role !== 'requester' ? (
              <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={isInternal}
                  onChange={(e) => setIsInternal(e.target.checked)}
                  disabled={isSubmitting}
                  className="rounded border-border text-brand focus:ring-brand"
                />
                Nota interna (apenas TI)
              </label>
            ) : <div />}
            <Button type="submit" disabled={isSubmitting || !newMessage.trim()}>
              Enviar
            </Button>
          </div>
        </form>
      </div>
    </SurfaceCard>
  );
}
