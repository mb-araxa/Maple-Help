'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { extractFirstName } from '@/lib/utils';
import { usePageTitle } from '@/lib/usePageTitle';
import Header from '@/components/Header';
import { checkIsAdmin } from '@/app/actions/chamados';
import { SurfaceCard } from '@/components/ui/SurfaceCard';

export default function HubMenu() {
  usePageTitle('Menu Principal');
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');

  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipTimer = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnterTI = () => {
    tooltipTimer.current = setTimeout(() => {
      setShowTooltip(true);
    }, 500);
  };

  const handleMouseLeaveTI = () => {
    if (tooltipTimer.current) {
      clearTimeout(tooltipTimer.current);
    }
    setShowTooltip(false);
  };

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        router.push('/');
        return;
      }

      const email = session.user.email || '';
      setUserName(extractFirstName(email));

      const adminStatus = await checkIsAdmin();
      setIsAdmin(adminStatus);

      setLoading(false);
    };

    checkAuth();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas p-6 md:p-12">
        <div className="fixed inset-x-0 top-6 z-50 px-6 md:px-12">
          <div className="bg-surface/85 backdrop-blur-md border border-border rounded-full flex max-w-5xl mx-auto justify-between items-center px-8 py-4 shadow-sm">
            <div className="h-7 w-32 bg-surface-muted rounded-lg animate-pulse" />
            <div className="flex items-center gap-4">
              <div className="h-4 w-24 bg-surface-muted rounded animate-pulse" />
              <div className="h-9 w-16 bg-surface-muted rounded-full animate-pulse" />
            </div>
          </div>
        </div>
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 pt-36 md:pt-28">
          <div className="bg-surface rounded-3xl border border-border p-10 h-52 animate-pulse">
            <div className="w-24 h-24 bg-surface-muted rounded-3xl mx-auto mb-6" />
            <div className="h-6 w-20 bg-surface-muted rounded mx-auto" />
          </div>
          <div className="bg-surface rounded-3xl border border-border p-10 h-52 animate-pulse">
            <div className="w-24 h-24 bg-surface-muted rounded-3xl mx-auto mb-6" />
            <div className="h-6 w-32 bg-surface-muted rounded mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas p-6 md:p-12">
      <Header userName={userName} />

      <main className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 pt-36 md:pt-28">

        {/* Card Admin */}
        {isAdmin && (
          <Link href="/adm" className="md:col-span-2 bg-[#111315] rounded-3xl shadow-xl border border-zinc-800 p-10 hover:shadow-2xl transition-all hover:-translate-y-1 flex items-center justify-between group overflow-hidden relative outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-ring">

            {/* Efeito de brilho no fundo */}
            <div className="absolute -right-20 -top-20 w-64 h-64 bg-brand-500 rounded-full blur-[80px] opacity-20 group-hover:opacity-40 transition-opacity"></div>

            <div className="relative z-10">
              <div className="flex items-center gap-6 mb-4">
                <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center text-brand-500 shadow-inner border border-zinc-700">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-9 h-9">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
                  </svg>
                </div>
                <h2 className="text-3xl font-extrabold text-white">Painel de ADM</h2>
              </div>
              <p className="text-zinc-400 font-medium text-lg">Gestão de chamados abertos e relatórios.</p>
            </div>

            <div className="relative z-10 bg-brand-500 text-white p-4 rounded-full opacity-0 group-hover:opacity-100 transition-all transform translate-x-8 group-hover:translate-x-0 shadow-lg shadow-red-500/50">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-8 h-8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </div>
          </Link>
        )}

        {/* Card de Chamado TI */}
        <div
          className="relative group h-full"
          onMouseEnter={handleMouseEnterTI}
          onMouseLeave={handleMouseLeaveTI}
          onFocus={() => setShowTooltip(true)}
          onBlur={() => setShowTooltip(false)}
        >
          <Link href="/chamado" className="block h-full outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-3xl rounded-ring">
            <SurfaceCard
              interactive
              className="flex flex-col items-center justify-center text-center p-10 h-full !rounded-3xl"
            >
              <div className="w-24 h-24 bg-red-50 rounded-3xl flex items-center justify-center mb-6 text-brand-500 group-hover:bg-brand-500 group-hover:text-white transition-colors duration-300 shadow-sm group-hover:shadow-md">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
                </svg>
              </div>
              <h2 className="text-3xl font-extrabold text-text tracking-tight">TI</h2>
              <p className="text-sm text-text-subtle font-medium mt-2 md:hidden">
                Lousa digital, internet, computadores e sistemas.
              </p>
            </SurfaceCard>
          </Link>

          {/* Tooltip Popup — desktop only */}
          {showTooltip && (
            <div className="hidden md:block absolute top-[105%] left-1/2 -translate-x-1/2 mt-4 w-72 bg-surface text-text font-medium text-sm p-4 rounded-xl shadow-xl border border-border z-50 animate-in fade-in zoom-in duration-200">
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-surface border-t border-l border-border rotate-45"></div>
              <div className="relative z-10 text-center leading-relaxed">
                Abrir chamados referentes a problemas na lousa digital, internet, computadores, e-mail e sistemas da escola.
              </div>
            </div>
          )}
        </div>

        {/* Card de Meus Chamados */}
        <Link href="/chamado/meus-chamados" className="block h-full outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-3xl rounded-ring group">
          <SurfaceCard
            interactive
            className="flex flex-col items-center justify-center text-center p-10 h-full !rounded-3xl"
          >
            <div className="w-24 h-24 bg-blue-50 rounded-3xl flex items-center justify-center mb-6 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300 shadow-sm group-hover:shadow-md">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
            </div>
            <h2 className="text-3xl font-extrabold text-text tracking-tight">Meus Chamados</h2>
            <p className="text-sm text-text-subtle font-medium mt-2 md:hidden">
              Acompanhe o andamento dos seus pedidos.
            </p>
          </SurfaceCard>
        </Link>
      </main>
    </div>
  );
}
