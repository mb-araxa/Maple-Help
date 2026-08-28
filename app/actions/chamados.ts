'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { extractFirstName } from '@/lib/utils';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { Chamado } from '@/types/database';
import { enviarEmailDeAtualizacao } from '@/lib/chamadoEmail';

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

type SupabaseServerClient = Awaited<ReturnType<typeof getSupabase>>;

function adicionarUrlsPublicasDosAnexos(
  supabase: SupabaseServerClient,
  chamados: Chamado[]
) {
  for (const chamado of chamados) {
    if (!chamado.anexo_url || chamado.anexo_url.startsWith('http')) continue;

    const { data } = supabase.storage
      .from('chamados-anexos')
      .getPublicUrl(chamado.anexo_url);

    chamado.anexo_url = data.publicUrl;
  }
}

export async function registrarAvaliacao(chamadoId: string, nota: number, comentario?: string) {
  const dados = z.object({
    chamadoId: z.string().uuid(),
    nota: z.number().int().min(1).max(5),
    comentario: z.string().trim().max(500).optional(),
  }).parse({ chamadoId, nota, comentario });

  const supabase = await getSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Usuário não autenticado.');

  const { data: chamado, error: chamadoError } = await supabase
    .from('chamados')
    .select('id, status')
    .eq('id', dados.chamadoId)
    .eq('user_id', userData.user.id)
    .single();

  if (chamadoError || !chamado) throw new Error('Chamado não encontrado ou sem permissão.');
  if (chamado.status !== 'Concluído') throw new Error('O chamado ainda não foi concluído.');

  const { data, error } = await supabase
    .from('chamado_avaliacoes')
    .insert({
      chamado_id: dados.chamadoId,
      user_id: userData.user.id,
      nota: dados.nota,
      comentario: dados.comentario || null,
    })
    .select('chamado_id, nota, comentario, created_at')
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('Esta avaliação já foi enviada.');
    throw new Error('Não foi possível enviar a avaliação.');
  }

  revalidatePath('/chamado/meus-chamados');
  return data;
}

export async function obterMinhaAvaliacao(chamadoId: string) {
  z.string().uuid().parse(chamadoId);
  const supabase = await getSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Usuário não autenticado.');

  const { data, error } = await supabase
    .from('chamado_avaliacoes')
    .select('chamado_id, nota, comentario, created_at')
    .eq('chamado_id', chamadoId)
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (error) throw new Error('Não foi possível carregar a avaliação.');
  return data;
}

// Configuração do Rate Limit (Upstash Redis)
const redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) 
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    }) 
  : null;

// Fallback de memória para dev local
const rateLimitMap = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT = 5; // Máximo de chamados
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // a cada 10 minutos

// 5 chamadas a cada 10 minutos
const ratelimit = redis ? new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(RATE_LIMIT, '10 m'),
}) : null;

/**
 * Validação de usuário e permissão de administrador na Server Action.
 * Consulta public.app_admins como fonte única e segura no banco de dados.
 */
async function requireAdmin() {
  const supabase = await getSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    throw new Error('Usuário não autenticado.');
  }

  const email = user.email?.toLowerCase();
  if (!email) {
    throw new Error('Acesso negado: e-mail não encontrado.');
  }

  const { data: adminData, error: adminError } = await supabase
    .from('app_admins')
    .select('email')
    .eq('email', email)
    .maybeSingle();

  if (adminError || !adminData) {
    throw new Error('Acesso negado: você não tem permissão de administrador.');
  }

  return { user, email, nome: extractFirstName(email) };
}

/**
 * Verifica se o usuário logado é administrador.
 * Usado pelo frontend (Menu) para ocultar botões de forma segura consultando app_admins.
 */
export async function checkIsAdmin(): Promise<boolean> {
  try {
    const supabase = await getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return false;

    const { data } = await supabase
      .from('app_admins')
      .select('email')
      .eq('email', user.email.toLowerCase())
      .maybeSingle();

    return !!data;
  } catch {
    return false;
  }
}

const abrirChamadoSchema = z.object({
  solicitante: z.string().min(1, 'Solicitante é obrigatório.').max(100),
  local: z.string().min(1, 'Local é obrigatório.').max(150),
  categoria: z.string().min(1, 'Categoria é obrigatória.').max(50),
  descricao: z.string().min(10, 'A descrição deve ter pelo menos 10 caracteres.').max(1000),
  anexo_url: z.string().optional().or(z.literal('')),
});

/**
 * Cria um novo chamado no sistema.
 * @param dados Dados do chamado (solicitante, local, categoria, descricao, anexo_url).
 * @returns O chamado recém-criado.
 */
export async function abrirChamado(dados: Omit<Chamado, 'id' | 'status' | 'resolucao' | 'data_criacao' | 'data_resolucao' | 'responsavel' | 'tempo_gasto'>) {
  try {
    // Rate Limiting (Limite de taxa)
    const reqHeaders = await headers();
    let ip = reqHeaders.get('x-forwarded-for') || '127.0.0.1';
    ip = ip.split(',')[0].trim();
    
    if (ratelimit) {
      const { success } = await ratelimit.limit(`ratelimit_${ip}`);
      if (!success) {
        throw new Error('Muitas solicitações. Aguarde alguns minutos antes de tentar novamente.');
      }
    } else {
      const now = Date.now();
      const userLimit = rateLimitMap.get(ip);
      
      if (!userLimit || (now - userLimit.lastReset > RATE_LIMIT_WINDOW_MS)) {
        rateLimitMap.set(ip, { count: 1, lastReset: now });
      } else {
        if (userLimit.count >= RATE_LIMIT) {
          throw new Error('Muitas solicitações. Aguarde alguns minutos antes de tentar novamente.');
        }
        userLimit.count += 1;
      }
    }

    // Validação com Zod
    const dadosValidados = abrirChamadoSchema.parse(dados);

    const supabase = await getSupabase();
    
    let userId: string | undefined = undefined;
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      userId = userData.user.id;
    }

    const payload = {
      solicitante: dadosValidados.solicitante,
      local: dadosValidados.local,
      categoria: dadosValidados.categoria,
      descricao: dadosValidados.descricao,
      status: 'Pendente',
      anexo_url: dadosValidados.anexo_url || null,
      ...(userId ? { user_id: userId } : {})
    };

    const { data, error } = await supabase
      .from('chamados')
      .insert([payload])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data as Chamado;
  } catch (error) {
    console.error('Erro em abrirChamado:', error);
    const message = error instanceof Error ? error.message : 'Erro ao abrir chamado';
    throw new Error(message);
  }
}

/**
 * Busca todos os chamados que ainda não foram concluídos (status 'Pendente' ou 'Em Andamento').
 * @returns Lista de chamados em aberto ordenados pelo mais antigo.
 */
export async function obterChamadosAbertos() {
  try {
    await requireAdmin();
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('chamados')
      .select('*')
      .neq('status', 'Concluído')
      .order('data_criacao', { ascending: true });

    if (error) {
      throw error;
    }

    const chamados = data as Chamado[];
    adicionarUrlsPublicasDosAnexos(supabase, chamados);

    return chamados;
  } catch (error) {
    console.error('Erro em obterChamadosAbertos:', error);
    const message = error instanceof Error ? error.message : 'Erro ao carregar chamados abertos';
    throw new Error(`Não foi possível carregar os chamados abertos: ${message}`);
  }
}

/**
 * Busca os chamados concluídos na data de HOJE.
 * Útil para acompanhamento diário no painel de chamados.
 * @returns Lista de chamados concluídos hoje.
 */
export async function obterChamadosConcluidosHoje() {
  try {
    await requireAdmin();
    const supabase = await getSupabase();
    
    const hojeInicio = new Date();
    hojeInicio.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('chamados')
      .select('*')
      .eq('status', 'Concluído')
      .gte('data_resolucao', hojeInicio.toISOString())
      .order('data_resolucao', { ascending: false });

    if (error) {
      throw error;
    }

    const chamados = data as Chamado[];
    adicionarUrlsPublicasDosAnexos(supabase, chamados);

    return chamados;
  } catch (error) {
    console.error('Erro em obterChamadosConcluidosHoje:', error);
    const message = error instanceof Error ? error.message : 'Erro ao carregar chamados de hoje';
    throw new Error(`Não foi possível carregar os chamados concluídos de hoje: ${message}`);
  }
}

/**
 * Retorna os chamados concluídos filtrados por mês/ano com paginação.
 */
export async function obterChamadosConcluidos(mes: number, ano: number, page: number = 1, limit: number = 50) {
  try {
    await requireAdmin();
    const supabase = await getSupabase();
    const dataInicio = new Date(ano, mes - 1, 1).toISOString();
    const dataFim = new Date(ano, mes, 1).toISOString();
    
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabase
      .from('chamados')
      .select('*', { count: 'exact' })
      .eq('status', 'Concluído')
      .gte('data_resolucao', dataInicio)
      .lt('data_resolucao', dataFim)
      .order('data_resolucao', { ascending: false })
      .range(from, to);

    if (error) throw error;
    
    const chamados = data as Chamado[];
    adicionarUrlsPublicasDosAnexos(supabase, chamados);

    return { 
      data: chamados, 
      count: count || 0 
    };
  } catch (error) {
    console.error('Erro em obterChamadosConcluidos:', error);
    const message = error instanceof Error ? error.message : 'Erro ao carregar relatório';
    throw new Error(`Não foi possível carregar o relatório de concluídos: ${message}`);
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
  } catch (error) {
    console.error('Erro em obterTodosChamadosConcluidos:', error);
    const message = error instanceof Error ? error.message : 'Erro ao carregar dados';
    throw new Error(`Não foi possível carregar os dados para exportação: ${message}`);
  }
}

const uuidSchema = z.string().uuid('ID inválido.');
const resolucaoSchema = z.string().min(5, 'A resolução deve ter pelo menos 5 caracteres.').max(1000);
const tempoGastoSchema = z.string().min(1, 'O tempo gasto é obrigatório.').max(50);

/**
 * Finaliza um chamado atualizando o status, a resolução e data/hora atual.
 */
/**
 * Busca o relatorio completo de concluidos sem depender do limite maximo de
 * linhas retornadas pela API do Supabase.
 */
export async function obterRelatorioCompleto(mes: number, ano: number) {
  try {
    await requireAdmin();
    z.number().int().min(1).max(12).parse(mes);
    z.number().int().min(2000).max(2100).parse(ano);

    const supabase = await getSupabase();
    const dataInicio = new Date(ano, mes - 1, 1).toISOString();
    const dataFim = new Date(ano, mes, 1).toISOString();
    const pageSize = 1000;
    const resultado: Chamado[] = [];

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('chamados')
        .select('*')
        .eq('status', 'Conclu\u00eddo')
        .gte('data_resolucao', dataInicio)
        .lt('data_resolucao', dataFim)
        .order('data_resolucao', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      const lote = (data || []) as Chamado[];
      resultado.push(...lote);

      if (lote.length < pageSize) break;
    }

    return resultado;
  } catch (error) {
    console.error('Erro em obterRelatorioCompleto:', error);
    const message = error instanceof Error ? error.message : 'Erro ao carregar dados';
    throw new Error(`Nao foi possivel carregar o relatorio completo: ${message}`);
  }
}

export async function finalizarChamado(id: string, resolucao: string, tempo_gasto: string) {
  try {
    await requireAdmin();
    uuidSchema.parse(id);
    resolucaoSchema.parse(resolucao);
    tempoGastoSchema.parse(tempo_gasto);

    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('chamados')
      .update({ 
        status: 'Concluído', 
        resolucao,
        tempo_gasto,
        data_resolucao: new Date().toISOString()
      })
      .eq('id', id)
      .eq('status', 'Em Andamento')
      .select()
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!data) throw new Error('O chamado não está em andamento ou já foi finalizado.');

    const chamado = data as Chamado;
    await enviarEmailDeAtualizacao(chamado, 'concluido');
    return chamado;
  } catch (error) {
    console.error('Erro em finalizarChamado:', error);
    const message = error instanceof Error ? error.message : 'Erro ao finalizar';
    throw new Error(`Não foi possível finalizar o chamado: ${message}`);
  }
}

/**
 * Altera o status do chamado para 'Em Andamento' indicando que alguém assumiu a tarefa.
 */
export async function assumirChamado(id: string) {
  try {
    const { nome: responsavel } = await requireAdmin();
    uuidSchema.parse(id);

    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('chamados')
      .update({ 
        status: 'Em Andamento',
        responsavel 
      })
      .eq('id', id)
      .eq('status', 'Pendente')
      .select()
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!data) throw new Error('O chamado já foi aceito ou não está mais pendente.');

    const chamado = data as Chamado;
    await enviarEmailDeAtualizacao(chamado, 'assumido');
    return chamado;
  } catch (error) {
    console.error('Erro em assumirChamado:', error);
    const message = error instanceof Error ? error.message : 'Erro ao assumir';
    throw new Error(`Não foi possível assumir o chamado: ${message}`);
  }
}

/**
 * Exclui um chamado do banco de dados.
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
  } catch (error) {
    console.error('Erro em deletarChamado:', error);
    const message = error instanceof Error ? error.message : 'Erro ao deletar';
    throw new Error(`Não foi possível deletar o chamado: ${message}`);
  }
}

/**
 * Busca todos os chamados abertos pelo usuário logado atualmente.
 * Usado na tela "Meus Chamados".
 */
export async function obterMeusChamados() {
  try {
    const supabase = await getSupabase();
    
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      throw new Error('Usuário não autenticado.');
    }
    
    const userId = userData.user.id;

    const { data, error } = await supabase
      .from('chamados')
      .select('*')
      .eq('user_id', userId)
      .order('data_criacao', { ascending: false });

    if (error) {
      if (error.code === '42703') {
         console.warn("A coluna user_id não existe no banco. Os dados retornarão vazios.");
         return [] as Chamado[];
      }
      throw error;
    }

    const chamados = data as Chamado[];
    adicionarUrlsPublicasDosAnexos(supabase, chamados);

    return chamados;
  } catch (error) {
    console.error('Erro em obterMeusChamados:', error);
    const message = error instanceof Error ? error.message : 'Erro ao carregar meus chamados';
    throw new Error(`Não foi possível carregar seus chamados: ${message}`);
  }
}

/**
 * Busca todos os chamados criados em um determinado mês e ano para gráficos/estatísticas.
 */
export async function obterEstatisticasMensais(mes: number, ano: number) {
  try {
    await requireAdmin();
    const supabase = await getSupabase();
    
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
  } catch (error) {
    console.error('Erro em obterEstatisticasMensais:', error);
    const message = error instanceof Error ? error.message : 'Erro ao carregar estatísticas';
    throw new Error(`Não foi possível carregar estatísticas: ${message}`);
  }
}
