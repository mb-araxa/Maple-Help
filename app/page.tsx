'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ToastProvider';
import Image from 'next/image';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';


export default function LoginPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.toLowerCase().endsWith('@maplebeararaxa.com.br')) {
      addToast('Acesso negado: Utilize seu e-mail institucional (@maplebeararaxa.com.br)', 'error');
      return;
    }

    setLoading(true);

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ 
        email, 
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/menu`
        }
      });
      if (error) {
        addToast('Erro ao criar conta: ' + error.message, 'error');
      } else {
        addToast('Conta criada! Verifique seu e-mail para confirmar o cadastro antes de fazer login.', 'success');
        setIsSignUp(false); // Volta para a tela de login
      }
      setLoading(false);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        addToast('E-mail ou senha incorretos.', 'error');
        setLoading(false);
      } else {
        router.push('/menu'); // Vai pro Hub
      }
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!resetEmail.toLowerCase().endsWith('@maplebeararaxa.com.br')) {
      addToast('Utilize seu e-mail institucional (@maplebeararaxa.com.br)', 'error');
      return;
    }

    setResetLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/`,
    });

    if (error) {
      addToast('Erro ao enviar e-mail de recuperação: ' + error.message, 'error');
    } else {
      addToast('E-mail de recuperação enviado! Verifique sua caixa de entrada.', 'success');
      setShowResetPassword(false);
      setResetEmail('');
    }
    setResetLoading(false);
  };

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
      
      {/* Container Principal */}
      <div className="w-full max-w-5xl bg-surface border border-border rounded-[2rem] overflow-hidden flex flex-col md:flex-row shadow-2xl">
        
        {/* Lado Esquerdo - Formulário */}
        <div className="w-full md:w-1/2 bg-surface p-10 md:p-14 flex flex-col justify-center relative z-10">
          
          {/* Logo mobile */}
          <div className="flex md:hidden items-center justify-center mb-8">
            <Image
              src="/maple_bear_login.png"
              alt="Maple Bear"
              width={100}
              height={100}
              className="object-contain"
            />
          </div>
          
          <h1 className="text-3xl md:text-4xl font-bold text-text mb-8 tracking-tight">
            {isSignUp ? 'Criar Conta' : 'Acesso Restrito'}
          </h1>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <FormField label="E-mail Institucional" required htmlFor="email">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-text-subtle">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-surface-muted border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white text-text placeholder:text-text-subtle transition-all font-medium"
                placeholder="nome@maplebeararaxa.com.br"
              />
            </FormField>

            <FormField label="Senha" required htmlFor="password">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-text-subtle">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-12 py-3.5 bg-surface-muted border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white text-text placeholder:text-text-subtle transition-all font-medium"
                placeholder="Sua senha"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-text-subtle hover:text-text focus:outline-none cursor-pointer"
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </FormField>

            {!isSignUp && (
              <div className="flex items-center justify-end -mt-2">
                <button
                  type="button"
                  onClick={() => setShowResetPassword(true)}
                  className="text-sm font-semibold text-text-muted hover:text-brand-500 transition-colors"
                >
                  Esqueceu a senha?
                </button>
              </div>
            )}

            <Button
              type="submit"
              isLoading={loading}
              className="w-full mt-2 py-3.5 text-base"
            >
              {isSignUp ? 'Finalizar Cadastro' : 'Entrar no Sistema'}
            </Button>
          </form>

          <p className="text-center text-sm font-medium text-text-muted mt-8">
            {isSignUp ? 'Já tem uma conta?' : 'Ainda não tem cadastro?'} {' '}
            <button 
              onClick={() => setIsSignUp(!isSignUp)}
              className="font-bold text-text hover:text-brand-500 hover:underline transition-colors"
            >
              {isSignUp ? 'Faça Login aqui' : 'Criar uma conta'}
            </button>
          </p>
        </div>
        
        {/* Lado Direito - Imagem e Logo (Painel Escuro Institucional) */}
        <div className="hidden md:flex w-1/2 bg-[#111315] items-center justify-center p-12 relative overflow-hidden">
          <div className="absolute inset-0 bg-brand-500/5 z-0"></div>
          {/* Logo da Maple Bear Centralizada */}
          <div className="relative z-10 opacity-90 transition-opacity hover:opacity-100">
            <Image 
              src="/maple_bear_login.png" 
              alt="Maple Bear" 
              width={350} 
              height={350}
              className="object-contain"
            />
          </div>
        </div>
      </div>

      {/* Modal de Recuperação de Senha */}
      {showResetPassword && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm"
          onClick={() => setShowResetPassword(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-surface w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <h2 className="text-xl font-bold text-text mb-2">Recuperar Senha</h2>
              <p className="text-sm text-text-muted mb-5 leading-relaxed">
                Digite seu e-mail institucional e enviaremos um link para redefinir sua senha.
              </p>
              <form onSubmit={handleResetPassword} className="space-y-6">
                <FormField label="E-mail" required htmlFor="resetEmail">
                  <input
                    id="resetEmail"
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="w-full px-4 py-3.5 bg-surface-muted border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white text-text placeholder:text-text-subtle transition-all font-medium"
                    placeholder="seu.nome@maplebeararaxa.com.br"
                    autoFocus
                  />
                </FormField>
                <div className="flex gap-3 justify-end border-t border-border pt-4">
                  <Button
                    type="button"
                    onClick={() => setShowResetPassword(false)}
                    variant="secondary"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    isLoading={resetLoading}
                    variant="primary"
                  >
                    Enviar Link
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
