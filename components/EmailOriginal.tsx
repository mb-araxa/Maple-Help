'use client';

import { useState } from 'react';
import type { Chamado } from '@/types/database';
import { obterEmailOriginal } from '@/app/actions/chamados';
import { Button } from '@/components/ui/Button';

export function EmailOriginal({ chamado }: { chamado: Chamado }) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  if (!chamado.email_original_path) return null;
  return <div className="mt-3">
    <Button variant="secondary" isLoading={carregando} onClick={async () => {
      setCarregando(true); setErro('');
      try {
        const url = await obterEmailOriginal(chamado.id);
        const link = document.createElement('a');
        link.href = url; link.download = `chamado-${chamado.id}.eml`;
        link.click();
      } catch { setErro('Não foi possível baixar o e-mail original.'); }
      finally { setCarregando(false); }
    }}>Baixar e-mail original e anexos (.eml)</Button>
    {erro && <p role="alert" className="text-sm text-red-800 mt-2">{erro}</p>}
  </div>;
}
