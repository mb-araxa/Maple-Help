/* eslint-disable @typescript-eslint/no-explicit-any */
'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Chamado } from '@/types/database';

async function getSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignorar erro se for chamado de um Server Component
          }
        },
      },
    }
  );
}

import { headers } from 'next/headers';
import { z } from 'zod';
// import { extractFirstName, getAdminEmails } from '@/lib/utils';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Configuração do Rate Limit (Upstash Redis)
const redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) 
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    }) 
  : null;

// Fallback de memória para dev local
const rateLimitMap = new Map<string, { count: number, lastReset: number }>();
const RATE_LIMIT = 5; // Máximo de chamados
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // a cada 10 minutos

// 5 chamadas a cada 10 minutos
const ratelimit = redis ? new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(RATE_LIMIT, '10 m'),
}) : null;

import { 
  requireAdmin, 
  requireTechnicianOrAdmin, 
  requireAuthenticatedUser
} from '@/app/actions/auth';

const abrirChamadoSchema = z.object({
  solicitante: z.string().min(1, 'Solicitante é obrigatório.').max(100),
  local: z.string().min(1, 'Local é obrigatório.').max(150),
  categoria: z.string().min(1, 'Categoria é obrigatória.').max(50),
  descricao: z.string().min(10, 'A descrição deve ter pelo menos 10 caracteres.').max(1000),
  area: z.enum(['ti', 'manutencao']).default('ti'),
  priority: z.enum(['baixa', 'normal', 'alta', 'critica']).default('normal'),
  anexo_url: z.string().optional().or(z.literal('')),
});

function calcularSLA(priority: 'baixa' | 'normal' | 'alta' | 'critica'): Date {
  const data = new Date();
  if (priority === 'critica') {
    data.setHours(data.getHours() + 4);
  } else if (priority === 'alta') {
    data.setDate(data.getDate() + 1);
  } else if (priority === 'normal') {
    data.setDate(data.getDate() + 3);
  } else if (priority === 'baixa') {
    data.setDate(data.getDate() + 5);
  }
  return data;
}

/**
 * Cria um novo chamado no sistema.
 * @param dados Dados do chamado (solicitante, local, categoria, descricao, area, priority).
 * @returns O chamado recém-criado.
 */
export async function abrirChamado(dados: Omit<Chamado, 'id' | 'status' | 'resolucao' | 'data_criacao' | 'data_resolucao' | 'responsavel' | 'tempo_gasto'>) {
  try {
    // Rate Limiting (Limite de taxa)
    const reqHeaders = await headers();
    let ip = reqHeaders.get('x-forwarded-for') || '127.0.0.1';
    // Se vier uma lista de IPs separada por vírgula, pegamos o primeiro
    ip = ip.split(',')[0].trim();
    
    if (ratelimit) {
      const { success } = await ratelimit.limit(`ratelimit_chamados_${ip}`);
      if (!success) {
        throw new Error('Você atingiu o limite de envio. Tente novamente em alguns minutos.');
      }
    } else {
      // Fallback em memória (para uso local)
      const now = Date.now();
      const rateRecord = rateLimitMap.get(ip);
      
      if (rateRecord && now - rateRecord.lastReset < RATE_LIMIT_WINDOW_MS) {
        if (rateRecord.count >= RATE_LIMIT) {
          throw new Error('Você atingiu o limite de envio. Tente novamente em alguns minutos.');
        }
        rateRecord.count += 1;
      } else {
        rateLimitMap.set(ip, { count: 1, lastReset: now });
      }
    }

    // 1. Validação de Dados com Zod
    const dadosValidados = abrirChamadoSchema.parse(dados);

    const supabase = await getSupabase();
    
    // Recupera o ID do usuário logado (se houver)
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;
    
    const dueAt = calcularSLA(dadosValidados.priority).toISOString();

    // Status será salvo como 'Pendente' para alinhar com a estrutura do BD.
    const { data, error } = await supabase
      .from('chamados')
      .insert([
        { 
          solicitante: dadosValidados.solicitante, 
          local: dadosValidados.local, 
          categoria: dadosValidados.categoria, 
          descricao: dadosValidados.descricao,
          area: dadosValidados.area,
          priority: dadosValidados.priority,
          due_at: dueAt,
          anexo_url: dadosValidados.anexo_url,
          status: 'Pendente',
          ...(userId ? { user_id: userId } : {})
        }
      ])
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Criar evento inicial
    await supabase.from('chamado_eventos').insert([
      {
        chamado_id: data.id,
        actor_id: userId || null,
        event_type: 'criacao',
        description: 'Chamado criado pelo solicitante.',
      }
    ]);

    return data as Chamado;
  } catch (error: any) {
    console.error('Erro em abrirChamado:', error);
    throw new Error(`Não foi possível abrir o chamado: ${error.message}`);
  }
}

/**
 * Retorna todos os chamados onde o status seja diferente de 'Concluído'.
 * Acesso exclusivo para administradores.
 * @returns Lista de chamados pendentes/abertos.
 */
export async function obterChamadosAbertos() {
  try {
    await requireAdmin();
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('chamados')
      .select('*')
      .neq('status', 'Concluído')
      .order('data_criacao', { ascending: false });

    if (error) throw error;

    const chamados = data as Chamado[];
    for (const c of chamados) {
      if (c.anexo_url && !c.anexo_url.startsWith('http')) {
        const { data: signed } = await supabase.storage.from('chamados-anexos').createSignedUrl(c.anexo_url, 3600);
        if (signed?.signedUrl) c.anexo_url = signed.signedUrl;
      }
    }

    return chamados;
  } catch (error: any) {
    console.error('Erro em obterChamadosAbertos:', error);
    throw new Error(`Não foi possível carregar os chamados abertos: ${error.message}`);
  }
}

/**
 * Retorna os últimos chamados concluídos hoje.
 * Acesso exclusivo para administradores.
 * @returns Lista limitada de chamados concluídos no dia atual.
 */
export async function obterChamadosConcluidosHoje() {
  try {
    await requireAdmin();
    const supabase = await getSupabase();
    
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dataInicioHoje = hoje.toISOString();
    
    const { data, error } = await supabase
      .from('chamados')
      .select('*')
      .eq('status', 'Concluído')
      .gte('data_resolucao', dataInicioHoje)
      .order('data_resolucao', { ascending: false })
      .limit(20);

    if (error) throw error;

    const chamados = data as Chamado[];
    for (const c of chamados) {
      if (c.anexo_url && !c.anexo_url.startsWith('http')) {
        const { data: signed } = await supabase.storage.from('chamados-anexos').createSignedUrl(c.anexo_url, 3600);
        if (signed?.signedUrl) c.anexo_url = signed.signedUrl;
      }
    }

    return chamados;
  } catch (error: any) {
    console.error('Erro em obterChamadosConcluidosHoje:', error);
    throw new Error(`Não foi possível carregar os chamados concluídos de hoje: ${error.message}`);
  }
}

/**
 * Retorna os chamados concluídos filtrados por mês/ano.
 * Ideal para exibição de relatórios gerenciais.
 * @param mes Mês (1 a 12).
 * @param ano Ano.
 * @returns Lista de chamados concluídos no período especificado.
 */
export async function obterChamadosConcluidos(mes: number, ano: number, page: number = 1, limit: number = 50) {
  try {
    await requireAdmin();
    const supabase = await getSupabase();
    // Definimos o início e fim do mês para criar o range de datas
    const dataInicio = new Date(ano, mes - 1, 1).toISOString();
    const dataFim = new Date(ano, mes, 1).toISOString();
    
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabase
      .from('chamados')
      .select('*', { count: 'exact' })
      .eq('status', 'Concluído')
      .gte('data_resolucao', dataInicio) // Maior ou igual ao início do mês
      .lt('data_resolucao', dataFim)     // Menor que o primeiro dia do próximo mês
      .order('data_resolucao', { ascending: false })
      .range(from, to);

    if (error) throw error;
    
    const chamados = data as Chamado[];
    for (const c of chamados) {
      if (c.anexo_url && !c.anexo_url.startsWith('http')) {
        const { data: signed } = await supabase.storage.from('chamados-anexos').createSignedUrl(c.anexo_url, 3600);
        if (signed?.signedUrl) c.anexo_url = signed.signedUrl;
      }
    }

    return { 
      data: chamados, 
      count: count || 0 
    };
  } catch (error: any) {
    console.error('Erro em obterChamadosConcluidos:', error);
    throw new Error(`Não foi possível carregar o relatório de concluídos: ${error.message}`);
  }
}

/**
 * Busca TODOS os chamados concluídos de um mês específico (sem paginação).
 * Útil para exportação Excel e cálculo de métricas.
 */
export async function obterTodosChamadosConcluidos(mes: number, ano: number) {
  try {
    await requireAdmin();
    const supabase = await getSupabase();
    const dataInicio = new Date(ano, mes - 1, 1).toISOString();
    const dataFim = new Date(ano, mes, 1).toISOString();

    const { data, error } = await supabase
      .from('chamados')
      .select('*')
      .eq('status', 'Concluído')
      .gte('data_resolucao', dataInicio)
      .lt('data_resolucao', dataFim)
      .order('data_resolucao', { ascending: false });

    if (error) {
      throw error;
    }

    return data as Chamado[];
  } catch (error: any) {
    console.error('Erro em obterTodosChamadosConcluidos:', error);
    throw new Error(`Não foi possível carregar os dados para exportação: ${error.message}`);
  }
}

const uuidSchema = z.string().uuid('ID inválido.');
const resolucaoSchema = z.string().min(5, 'A resolução deve ter pelo menos 5 caracteres.').max(1000);
const tempoGastoSchema = z.string().min(1, 'O tempo gasto é obrigatório.').max(50);

/**
 * Finaliza um chamado atualizando o status, a resolução e data/hora atual.
 * @param id ID (uuid) do chamado.
 * @param resolucao Texto informando como o chamado foi concluído.
 * @param tempo_gasto O tempo gasto no chamado.
 * @returns O chamado atualizado.
 */
export async function finalizarChamado(id: string, resolucao: string, tempo_gasto: string) {
  try {
    const profile = await requireTechnicianOrAdmin();
    uuidSchema.parse(id);
    resolucaoSchema.parse(resolucao);
    tempoGastoSchema.parse(tempo_gasto);

    const supabase = await getSupabase();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('chamados')
      .update({ 
        status: 'Concluído', 
        resolucao,
        tempo_gasto,
        data_resolucao: now,
        closed_at: now,
        closed_by: profile.id
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    await supabase.from('chamado_eventos').insert([{
      chamado_id: data.id,
      actor_id: profile.id,
      event_type: 'concluido',
      description: 'Chamado concluído.'
    }]);

    return data as Chamado;
  } catch (error: any) {
    console.error('Erro em finalizarChamado:', error);
    throw new Error(`Não foi possível finalizar o chamado: ${error.message}`);
  }
}

/**
 * Altera o status do chamado para 'Em Andamento' indicando que alguém assumiu a tarefa.
 * @param id ID (uuid) do chamado.
 * @returns O chamado atualizado.
 */
export async function assumirChamado(id: string) {
  try {
    const profile = await requireTechnicianOrAdmin();
    uuidSchema.parse(id);

    const supabase = await getSupabase();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('chamados')
      .update({ 
        status: 'Em Andamento',
        assigned_to: profile.id,
        assigned_at: now,
        responsavel: profile.full_name || 'Técnico'
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    await supabase.from('chamado_eventos').insert([{
      chamado_id: data.id,
      actor_id: profile.id,
      event_type: 'assumido',
      description: `Chamado assumido por ${profile.full_name || 'Técnico'}.`
    }]);

    return data as Chamado;
  } catch (error: any) {
    console.error('Erro em assumirChamado:', error);
    throw new Error(`Não foi possível assumir o chamado: ${error.message}`);
  }
}

/**
 * Reabre um chamado que já estava concluído.
 * @param id ID do chamado
 * @param motivo Motivo da reabertura
 */
export async function reabrirChamado(id: string, motivo: string) {
  try {
    const profile = await requireAuthenticatedUser();
    uuidSchema.parse(id);
    z.string().min(10, 'O motivo deve ter pelo menos 10 caracteres.').parse(motivo);

    const supabase = await getSupabase();
    
    // Check permission
    const { data: chamado } = await supabase.from('chamados').select('*').eq('id', id).single();
    if (!chamado) throw new Error('Chamado não encontrado.');
    if (chamado.user_id !== profile.id && profile.role !== 'admin') {
      throw new Error('Sem permissão para reabrir este chamado.');
    }
    
    const { data, error } = await supabase
      .from('chamados')
      .update({ 
        status: 'Reaberto',
        reopened_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await supabase.from('chamado_eventos').insert([{
      chamado_id: data.id,
      actor_id: profile.id,
      event_type: 'reaberto',
      description: `Chamado reaberto. Motivo: ${motivo}`
    }]);

    return data as Chamado;
  } catch (error: any) {
    console.error('Erro em reabrirChamado:', error);
    throw new Error(`Não foi possível reabrir o chamado: ${error.message}`);
  }
}

/**
 * Exclui um chamado do banco de dados (Útil para testes).
 * @param id ID (uuid) do chamado.
 */
export async function deletarChamado(id: string) {
  try {
    await requireAdmin();
    uuidSchema.parse(id);
    const supabase = await getSupabase();
    const { error } = await supabase
      .from('chamados')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }
    
    return true;
  } catch (error: any) {
    console.error('Erro em deletarChamado:', error);
    throw new Error(`Não foi possível deletar o chamado: ${error.message}`);
  }
}

/**
 * Busca todos os chamados abertos pelo usuário logado atualmente.
 * Usado na tela "Meus Chamados".
 */
export async function obterMeusChamados() {
  try {
    const supabase = await getSupabase();
    
    // Pega o usuário atual
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('Usuário não autenticado.');
    }
    
    const userId = user.id;

    // Busca apenas os chamados onde user_id bate com o usuário atual
    const { data, error } = await supabase
      .from('chamados')
      .select('*')
      .eq('user_id', userId)
      .order('data_criacao', { ascending: false });

    if (error) {
      if (error.code === '42703') { // Column does not exist
         console.warn("A coluna user_id não existe no banco. Os dados retornarão vazios.");
         return [] as Chamado[];
      }
      throw error;
    }

    const chamados = data as Chamado[];
    for (const c of chamados) {
      if (c.anexo_url && !c.anexo_url.startsWith('http')) {
        const { data: signed } = await supabase.storage.from('chamados-anexos').createSignedUrl(c.anexo_url, 3600);
        if (signed?.signedUrl) c.anexo_url = signed.signedUrl;
      }
    }

    return chamados;
  } catch (error: any) {
    console.error('Erro em obterMeusChamados:', error);
    throw new Error(`Não foi possível carregar seus chamados: ${error.message}`);
  }
}

/**
 * Busca todos os chamados criados em um determinado mês e ano, 
 * independentemente do status, para alimentar gráficos estatísticos.
 */
export async function obterEstatisticasMensais(mes: number, ano: number) {
  try {
    await requireAdmin();
    const supabase = await getSupabase();
    
    // Início e fim do mês
    const dataInicio = new Date(ano, mes - 1, 1).toISOString();
    const dataFim = new Date(ano, mes, 1).toISOString();

    const { data, error } = await supabase
      .from('chamados')
      .select('*')
      .gte('data_criacao', dataInicio)
      .lt('data_criacao', dataFim)
      .order('data_criacao', { ascending: false });

    if (error) {
      throw error;
    }

    return data as Chamado[];
  } catch (error: any) {
    console.error('Erro em obterEstatisticasMensais:', error);
    throw new Error(`Não foi possível carregar estatísticas: ${error.message}`);
  }
}

export async function obterChamado(id: string) {
  try {
    const supabase = await getSupabase();
    await requireAuthenticatedUser();
    
    // RLS will enforce that only requester can see their own, and tech/admin can see all
    const { data, error } = await supabase
      .from('chamados')
      .select('*, profiles!chamados_assigned_to_fkey(full_name, avatar_url, role)')
      .eq('id', id)
      .single();

    if (error) throw error;
    
    const chamado = data as any;
    if (chamado.anexo_url && !chamado.anexo_url.startsWith('http')) {
      const { data: signed } = await supabase.storage.from('chamados-anexos').createSignedUrl(chamado.anexo_url, 3600);
      if (signed?.signedUrl) chamado.anexo_url = signed.signedUrl;
    }

    return chamado;
  } catch (error: any) {
    console.error('Erro em obterChamado:', error);
    throw new Error('N�o foi poss�vel carregar o chamado: ' + error.message);
  }
}

export async function obterEventos(chamadoId: string) {
  try {
    const supabase = await getSupabase();
    await requireAuthenticatedUser();
    
    const { data, error } = await supabase
      .from('chamado_eventos')
      .select('*, profiles!chamado_eventos_actor_id_fkey(full_name, avatar_url, role)')
      .eq('chamado_id', chamadoId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data;
  } catch (error: any) {
    console.error('Erro em obterEventos:', error);
    throw new Error('N�o foi poss�vel carregar os eventos: ' + error.message);
  }
}

export async function obterMensagens(chamadoId: string) {
  try {
    const supabase = await getSupabase();
    await requireAuthenticatedUser();
    
    const { data, error } = await supabase
      .from('chamado_mensagens')
      .select('*, profiles!chamado_mensagens_author_id_fkey(full_name, avatar_url, role)')
      .eq('chamado_id', chamadoId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data;
  } catch (error: any) {
    console.error('Erro em obterMensagens:', error);
    throw new Error('N�o foi poss�vel carregar as mensagens: ' + error.message);
  }
}

export async function enviarMensagem(chamadoId: string, message: string, isInternal: boolean = false) {
  try {
    const profile = await requireAuthenticatedUser();
    const supabase = await getSupabase();
    
    if (isInternal && profile.role === 'requester') {
      throw new Error('Sem permiss�o para enviar mensagem interna.');
    }

    const { data, error } = await supabase
      .from('chamado_mensagens')
      .insert([{
        chamado_id: chamadoId,
        author_id: profile.id,
        message,
        is_internal: isInternal
      }])
      .select()
      .single();

    if (error) throw error;
    
    return data;
  } catch (error: any) {
    console.error('Erro em enviarMensagem:', error);
    throw new Error('N�o foi poss�vel enviar a mensagem: ' + error.message);
  }
}

