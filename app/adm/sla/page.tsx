'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { obterPoliticasSla, salvarPoliticasSla } from '@/app/actions/chamados';
import { PRIORIDADES, PRIORIDADE_LABEL, type Prioridade } from '@/lib/sla';
import { Button } from '@/components/ui/Button';
import { SurfaceCard } from '@/components/ui/SurfaceCard';

export default function ConfiguracaoSlaPage() {
  const [prazos, setPrazos] = useState<Record<Prioridade, string>>({ baixa: '', media: '', alta: '', critica: '' });
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState(false);
  useEffect(() => {
    obterPoliticasSla().then(dados => {
      setPrazos(Object.fromEntries(PRIORIDADES.map(p => [p, String(dados.find(d => d.prioridade === p)?.prazo_horas ?? '')])) as Record<Prioridade, string>);
    }).catch(e => setErro(e.message)).finally(() => setCarregando(false));
  }, []);
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true); setErro(''); setSucesso(false);
    try {
      await salvarPoliticasSla(PRIORIDADES.map(prioridade => ({ prioridade, prazo_horas: Number(prazos[prioridade]) })));
      setSucesso(true);
    } catch { setErro('Não foi possível salvar. Informe os quatro prazos entre 0,25 e 8.760 horas, em intervalos de 15 minutos.'); }
    finally { setSalvando(false); }
  }
  return <div className="max-w-3xl mx-auto w-full space-y-6">
    <Link href="/adm" className="text-brand-600 font-semibold">← Voltar ao painel</Link>
    <div><h1 className="text-3xl font-bold text-text">Prazos de SLA</h1>
      <p className="mt-2 text-text-muted">Prazo para resolução de cada prioridade, em horas corridas, incluindo noites, fins de semana e feriados.</p></div>
    <SurfaceCard className="p-6">
      <form onSubmit={salvar} className="space-y-6">
        <p className="text-sm text-text-muted">Configure os quatro prazos antes de abrir novos chamados. As alterações valem para novos chamados e mudanças de prioridade. Os prazos já aplicados são preservados.</p>
        <div className="grid gap-5 sm:grid-cols-2">
          {PRIORIDADES.map(prioridade => <div key={prioridade}>
            <label htmlFor={`prazo-${prioridade}`} className="block font-semibold text-text mb-2">{PRIORIDADE_LABEL[prioridade]} — horas</label>
            <input id={`prazo-${prioridade}`} type="number" required min="0.25" max="8760" step="0.25"
              disabled={carregando || salvando} value={prazos[prioridade]}
              onChange={e => { setPrazos({ ...prazos, [prioridade]: e.target.value }); setSucesso(false); }}
              className="w-full rounded-lg border border-border bg-surface p-3 text-text focus:ring-2 focus:ring-brand-500" />
          </div>)}
        </div>
        {erro && <p role="alert" className="text-red-800">{erro}</p>}
        {sucesso && <p role="status" className="text-emerald-800">Prazos salvos.</p>}
        <Button type="submit" disabled={carregando} isLoading={salvando}>Salvar prazos</Button>
      </form>
    </SurfaceCard>
  </div>;
}
