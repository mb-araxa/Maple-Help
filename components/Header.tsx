'use client';

import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';

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
    <div className="fixed inset-x-0 top-6 z-50 px-6 md:px-12">
      <header className="bg-surface/85 backdrop-blur-lg shadow-sm border border-border rounded-3xl flex max-w-5xl mx-auto flex-col md:flex-row justify-between items-center px-8 py-4 transition-all duration-300 hover:shadow-md">
        
        {/* Lado Esquerdo: Logotipo */}
        <h1 className="text-2xl font-extrabold text-brand-500 tracking-tight drop-shadow-sm">
          Maple Help
        </h1>
        
        {/* Lado Direito: Usuário e Sair */}
        <div className="flex items-center gap-4 mt-4 md:mt-0">
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
