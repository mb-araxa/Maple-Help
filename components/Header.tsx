'use client';

import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { NotificationBell } from '@/components/NotificationBell';

interface HeaderProps {
  userName: string;
}

export default function Header({ userName }: HeaderProps) {
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  return (
    <div className="sticky top-6 z-50 w-full max-w-5xl mx-auto px-4 md:px-0 mb-12">
      <header className="bg-surface/85 backdrop-blur-lg shadow-sm border border-border rounded-3xl flex flex-col md:flex-row justify-between items-center px-8 py-4 transition-all duration-300 hover:shadow-md">
        
        {/* Lado Esquerdo: Logotipo */}
        <h1 className="text-2xl font-extrabold text-brand-500 tracking-tight drop-shadow-sm">
          Maple Help
        </h1>
        
        {/* Lado Direito: Usuário e Sair */}
        <div className="flex items-center gap-4 mt-4 md:mt-0">
          {/* NotificationBell will be active in Entrega 2 */}
          {process.env.NEXT_PUBLIC_ENABLE_NOTIFICATIONS === 'true' && (
            <NotificationBell notifications={[]} />
          )}
          <span className="text-text-muted font-medium text-sm">
            Olá, {userName}
          </span>
          <Button 
            onClick={handleLogout}
            variant="secondary"
            className="rounded-full px-5 py-2.5 text-sm"
          >
            Sair
          </Button>
        </div>
      </header>
    </div>
  );
}
