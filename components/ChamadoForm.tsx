'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ToastProvider';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';

interface ChamadoFormProps {
  area: 'ti' | 'manutencao';
  categorias: string[];
  onSubmitSuccess: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  abrirChamadoAction: (data: any) => Promise<any>;
}

export function ChamadoForm({
  area,
  categorias,
  onSubmitSuccess,
  abrirChamadoAction
}: ChamadoFormProps) {
  const { addToast } = useToast();
  const [solicitante, setSolicitante] = useState('');
  const [local, setLocal] = useState('');
  const [categoria, setCategoria] = useState('');
  const [descricao, setDescricao] = useState('');
  const [loading, setLoading] = useState(false);
  const [anexo, setAnexo] = useState<File | null>(null);

  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const isFieldInvalid = (field: string, value: string) => touched[field] && !value.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let anexo_url: string | undefined = undefined;
      
      if (anexo) {
        const MAX_FILE_SIZE = 5 * 1024 * 1024;
        const validTypes = ['image/jpeg', 'image/png', 'image/webp'];

        if (anexo.size > MAX_FILE_SIZE) {
          throw new Error('O arquivo excede o limite de 5MB.');
        }

        if (!validTypes.includes(anexo.type)) {
          throw new Error('Formato inválido. Use JPEG, PNG ou WEBP.');
        }

        const fileExt = anexo.name.split('.').pop();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) throw new Error('Usuário não autenticado.');
        const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('chamados-anexos')
          .upload(fileName, anexo);
          
        if (uploadError) {
          throw new Error('Erro ao fazer upload da imagem: ' + uploadError.message);
        }
        
        anexo_url = fileName;
      }

      try {
        await abrirChamadoAction({ 
          solicitante, 
          local, 
          categoria, 
          descricao, 
          area,
          priority: 'normal',
          anexo_url 
        });
      } catch (chamadoError: unknown) {
        if (anexo_url) {
          await supabase.storage.from('chamados-anexos').remove([anexo_url]);
        }
        throw chamadoError;
      }
      
      setSolicitante('');
      setLocal('');
      setCategoria('');
      setDescricao('');
      setAnexo(null);
      setTouched({});
      
      onSubmitSuccess();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Ocorreu um erro inesperado ao abrir o chamado.';
      addToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const MAX_DESC = 500;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <FormField 
        label="Solicitante" 
        htmlFor="solicitante" 
        required
        error={isFieldInvalid('solicitante', solicitante) ? 'Este campo é obrigatório' : undefined}
      >
        <input
          id="solicitante"
          type="text"
          required
          value={solicitante}
          onChange={(e) => setSolicitante(e.target.value)}
          onBlur={() => setTouched(t => ({ ...t, solicitante: true }))}
          className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors text-text placeholder:text-text-subtle bg-surface ${
            isFieldInvalid('solicitante', solicitante) ? 'border-status-danger bg-red-50' : 'border-border'
          }`}
          placeholder="Nome do professor ou funcionário"
        />
      </FormField>

      <FormField 
        label="Local / Sala" 
        htmlFor="local" 
        required
        error={isFieldInvalid('local', local) ? 'Este campo é obrigatório' : undefined}
      >
        <input
          id="local"
          type="text"
          required
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => setTouched(t => ({ ...t, local: true }))}
          className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors text-text placeholder:text-text-subtle bg-surface ${
            isFieldInvalid('local', local) ? 'border-status-danger bg-red-50' : 'border-border'
          }`}
          placeholder="Ex: Secretaria, Sala de movimento..."
        />
      </FormField>

      <FormField 
        label="Categoria" 
        htmlFor="categoria" 
        required
        error={isFieldInvalid('categoria', categoria) ? 'Selecione uma categoria' : undefined}
      >
        <select
          id="categoria"
          required
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          onBlur={() => setTouched(t => ({ ...t, categoria: true }))}
          className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors bg-surface text-text ${
            isFieldInvalid('categoria', categoria) ? 'border-status-danger bg-red-50' : 'border-border'
          }`}
        >
          <option value="" disabled>Selecione uma categoria</option>
          {categorias.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </FormField>

      <FormField 
        label="Descrição do Problema" 
        htmlFor="descricao" 
        required
        error={isFieldInvalid('descricao', descricao) ? 'Este campo é obrigatório' : undefined}
      >
        <textarea
          id="descricao"
          required
          rows={4}
          minLength={10}
          maxLength={MAX_DESC}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          onBlur={() => setTouched(t => ({ ...t, descricao: true }))}
          className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors resize-none text-text placeholder:text-text-subtle bg-surface ${
            isFieldInvalid('descricao', descricao) ? 'border-status-danger bg-red-50' : 'border-border'
          }`}
          placeholder="Descreva com detalhes o problema que está ocorrendo..."
        ></textarea>
        <div className="flex justify-end items-center mt-1">
          <span className={`text-xs font-medium ${descricao.length > MAX_DESC * 0.9 ? 'text-status-warning-text' : 'text-text-muted'}`}>
            {descricao.length}/{MAX_DESC}
          </span>
        </div>
      </FormField>

      <div>
        <label htmlFor="anexo" className="block text-sm font-medium text-text mb-1">
          Anexo <span className="text-text-muted text-xs font-normal ml-1">- Opcional</span>
        </label>
        <div className="relative">
          <input
            id="anexo"
            type="file"
            accept="image/jpeg, image/png, image/webp"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                const file = e.target.files[0];
                if (file.size > 5 * 1024 * 1024) {
                  addToast('O arquivo excede o limite de 5MB.', 'error');
                  return;
                }
                if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
                  addToast('Formato inválido. Use JPEG, PNG ou WEBP.', 'error');
                  return;
                }
                setAnexo(file);
              }
            }}
          />
          <label
            htmlFor="anexo"
            className="flex items-center justify-center w-full px-4 py-4 border-2 border-dashed border-border rounded-lg text-sm font-medium text-text-muted hover:bg-surface-muted hover:border-brand-500 hover:text-brand-500 cursor-pointer transition-all"
          >
            {anexo ? (
              <span className="flex items-center gap-2 text-status-completed-text">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Arquivo selecionado: {anexo.name}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                Clique aqui para anexar uma foto ou print
              </span>
            )}
          </label>
        </div>
        <p className="text-xs text-text-subtle mt-1.5">
          Envie uma foto ou print da tela mostrando o problema para ajudar a equipe.
        </p>
      </div>

      <Button
        type="submit"
        isLoading={loading}
        className="w-full py-3"
      >
        Abrir Chamado
      </Button>
    </form>
  );
}
