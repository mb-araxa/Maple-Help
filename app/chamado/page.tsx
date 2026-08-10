'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { abrirChamado } from '../actions/chamados';
import { supabase } from '@/lib/supabase';
import { extractFirstName } from '@/lib/utils';
import { usePageTitle } from '@/lib/usePageTitle';
import { Button } from '@/components/ui/Button';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { ChamadoForm } from '@/components/ChamadoForm';

const categoriasTI = [
  'Wi-fi | Cabeamento',
  'Computador | Notebook',
  'Televisão | Som',
  'Ajuda | Duvidas',
  'Outros'
];

export default function ChamadoPage() {
  usePageTitle('Abrir Chamado');
  const router = useRouter();
  const [showSuccess, setShowSuccess] = useState(false);
  const [primeiroNome, setPrimeiroNome] = useState('');

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email) {
        setPrimeiroNome(extractFirstName(session.user.email));
      }
    };
    fetchUser();
  }, []);

  return (
    <main className="min-h-screen bg-canvas p-6 md:p-12">
      <div className="max-w-2xl mx-auto">
        <button 
          onClick={() => router.push('/menu')}
          className="mb-8 flex items-center text-text-subtle hover:text-text transition-colors font-medium text-sm gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Voltar para o Menu
        </button>

        <SurfaceCard className="p-8">
          <div className="flex flex-col md:flex-row items-center md:items-center justify-between relative mb-10 mt-2 gap-4">
            <div className="flex flex-col z-10 text-center md:text-left">
              <h1 className="text-4xl font-extrabold text-brand-500 tracking-tight">
                Maple Help
              </h1>
              <p className="text-text-muted font-medium mt-1">Central de Suporte TI</p>
            </div>

            <div className="relative flex items-center">
              <div className="hidden md:block absolute right-full mr-4 top-1/2 -translate-y-1/2 bg-red-50 border border-red-100 rounded-2xl rounded-tr-none shadow-sm px-4 py-3 min-w-[200px]">
                <p className="text-status-danger-text font-medium text-sm leading-relaxed">
                  {primeiroNome ? `Olá, ${primeiroNome}! Qual o problema de hoje?` : 'Olá! Qual o problema de hoje?'}
                </p>
                <div className="absolute top-0 -right-2 w-0 h-0 border-t-[10px] border-t-red-50 border-r-[10px] border-r-transparent"></div>
              </div>

              <div className="relative z-10 md:translate-x-4">
                <Image 
                  src="/maple_bear_chamado_02.png" 
                  alt="Mascote Maple Bear" 
                  width={140} 
                  height={140} 
                  className="object-contain drop-shadow-lg transform hover:scale-105 transition-transform duration-300"
                />
              </div>
            </div>

            <p className="md:hidden text-sm text-status-danger-text font-medium text-center bg-red-50 border border-red-100 rounded-xl px-4 py-2 w-full">
              {primeiroNome ? `Olá, ${primeiroNome}! Qual o problema de hoje?` : 'Olá! Qual o problema de hoje?'}
            </p>
          </div>
          
          <ChamadoForm 
            categorias={categoriasTI}
            onSubmitSuccess={() => setShowSuccess(true)}
            abrirChamadoAction={abrirChamado}
          />
        </SurfaceCard>
      </div>
      
      {/* Modal de Sucesso */}
      {showSuccess && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm transition-all">
          <div className="bg-surface rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="flex items-center justify-center mx-auto mb-6">
              <Image 
                src="/maple_bear_concluido.png" 
                alt="Chamado Concluído" 
                width={180} 
                height={180} 
                className="object-contain drop-shadow-sm"
              />
            </div>
            <h2 className="text-2xl font-extrabold text-text mb-3">Tudo Certo!</h2>
            <p className="text-text-muted mb-8 font-medium leading-relaxed">
              Seu chamado foi aberto com sucesso. A equipe de TI já foi notificada e irá te atender em breve.
            </p>
            <Button
              onClick={() => setShowSuccess(false)}
              variant="secondary"
              className="w-full py-3.5"
            >
              Entendido
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
