'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';

type EstadoLink = 'validando' | 'valido' | 'invalido';

export default function RecuperarSenhaPage() {
  const router = useRouter();
  const [estadoLink, setEstadoLink] = useState<EstadoLink>('validando');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;

    async function validarLink() {
      const url = new URL(window.location.href);
      const erroNoLink = url.searchParams.get('error_description');
      if (erroNoLink) {
        if (ativo) {
          setErro('Este link de recuperação expirou ou já foi utilizado. Solicite um novo link.');
          setEstadoLink('invalido');
        }
        return;
      }

      let { data, error: sessionError } = await supabase.auth.getSession();
      const code = url.searchParams.get('code');
      if (!data.session && code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          if (ativo) {
            setErro('Este link de recuperação expirou ou já foi utilizado. Solicite um novo link.');
            setEstadoLink('invalido');
          }
          return;
        }
        window.history.replaceState({}, '', '/recuperar-senha');
        ({ data, error: sessionError } = await supabase.auth.getSession());
      }

      if (!ativo) return;
      if (sessionError || !data.session) {
        setErro('Não foi possível validar o link. Solicite uma nova recuperação de senha.');
        setEstadoLink('invalido');
        return;
      }
      setEstadoLink('valido');
    }

    void validarLink();
    return () => { ativo = false; };
  }, []);

  async function atualizarSenha(event: React.FormEvent) {
    event.preventDefault();
    setErro('');
    if (senha.length < 8) {
      setErro('A nova senha deve ter pelo menos 8 caracteres.');
      return;
    }
    if (senha !== confirmacao) {
      setErro('As senhas digitadas não coincidem.');
      return;
    }

    setSalvando(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: senha });
    if (updateError) {
      setErro('Não foi possível atualizar a senha. Solicite um novo link e tente novamente.');
      setSalvando(false);
      return;
    }

    await supabase.auth.signOut();
    router.replace('/?senhaAtualizada=1');
  }

  return (
    <main className="min-h-screen bg-canvas flex items-center justify-center p-4">
      <section className="w-full max-w-md bg-surface border border-border rounded-3xl shadow-2xl p-8 md:p-10">
        <div className="flex justify-center mb-6">
          <Image src="/maple_bear_login.png" alt="Maple Bear" width={96} height={96} className="object-contain" />
        </div>
        <h1 className="text-2xl font-bold text-text text-center">Criar nova senha</h1>

        {estadoLink === 'validando' && (
          <p role="status" className="text-center text-text-muted mt-4">Validando seu link de recuperação…</p>
        )}

        {estadoLink === 'invalido' && (
          <div className="mt-6 space-y-5 text-center">
            <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-4">{erro}</p>
            <Link href="/" className="inline-flex font-semibold text-brand-500 hover:underline">Voltar e solicitar outro link</Link>
          </div>
        )}

        {estadoLink === 'valido' && (
          <form onSubmit={atualizarSenha} className="mt-6 space-y-5">
            <p className="text-sm text-text-muted">Digite uma nova senha com pelo menos 8 caracteres.</p>
            <FormField label="Nova senha" required htmlFor="novaSenha">
              <input
                id="novaSenha"
                type={mostrarSenha ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={8}
                value={senha}
                onChange={(event) => setSenha(event.target.value)}
                className="w-full px-4 py-3.5 bg-surface-muted border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 text-text"
              />
            </FormField>
            <FormField label="Confirmar nova senha" required htmlFor="confirmarSenha">
              <input
                id="confirmarSenha"
                type={mostrarSenha ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmacao}
                onChange={(event) => setConfirmacao(event.target.value)}
                className="w-full px-4 py-3.5 bg-surface-muted border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 text-text"
              />
            </FormField>
            <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
              <input type="checkbox" checked={mostrarSenha} onChange={(event) => setMostrarSenha(event.target.checked)} />
              Mostrar senhas
            </label>
            {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
            <Button type="submit" isLoading={salvando} className="w-full">Salvar nova senha</Button>
          </form>
        )}
      </section>
    </main>
  );
}
