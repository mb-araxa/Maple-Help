'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { extractFirstName } from '@/lib/utils';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { ChamadoMensagem, ContadoresNaoLidos, CursorPaginacaoChat } from '@/types/database';

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

// Configuração do Rate Limit (Upstash Redis)
const redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) 
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    }) 
  : null;

// Fallback de memória para ambiente local de desenvolvimento (best-effort)
const chatRateLimitMap = new Map<string, { count: number; lastReset: number }>();
const CHAT_RATE_LIMIT = 20; // 20 mensagens
const CHAT_RATE_LIMIT_WINDOW_MS = 60 * 1000; // a cada 1 minuto

const chatRatelimit = redis ? new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(CHAT_RATE_LIMIT, '1 m'),
}) : null;

/**
 * Validação de sessão segura via auth.getUser().
 * Retorna o usuário autenticado e indica se possui permissão de administrador via public.app_admins
 * ou fallback para ADMIN_EMAILS caso a migration ainda esteja pendente.
 */
async function getAuthenticatedUser() {
  const supabase = await getSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error('Usuário não autenticado.');
  }

  const email = user.email?.toLowerCase();
  let isAdmin = false;

  if (email) {
    const { data: adminRecord, error: adminError } = await supabase
      .from('app_admins')
      .select('email')
      .eq('email', email)
      .maybeSingle();

    if (adminError && adminError.code === '42P01') {
      isAdmin = (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map(e => e.trim().toLowerCase())
        .includes(email);
    } else {
      isAdmin = !!adminRecord;
    }
  }

  return { supabase, user, email, isAdmin };
}

const uuidSchema = z.string().uuid('ID de chamado inválido.');
const mensagemSchema = z.string()
  .trim()
  .min(1, 'A mensagem não pode estar vazia.')
  .max(2000, 'A mensagem não pode exceder 2.000 caracteres.');

/**
 * Busca mensagens paginadas de um chamado com cursor composto seguro (created_at, id).
 */
export async function obterMensagensDoChamado(
  chamadoId: string,
  limit: number = 50,
  cursor?: CursorPaginacaoChat
): Promise<{ mensagens: ChamadoMensagem[]; hasMore: boolean; nextCursor?: CursorPaginacaoChat }> {
  try {
    uuidSchema.parse(chamadoId);
    z.number().int().min(1).max(100).parse(limit);

    const { supabase, user, isAdmin } = await getAuthenticatedUser();

    // Valida acesso ao chamado
    const { data: chamado, error: chamadoError } = await supabase
      .from('chamados')
      .select('id, user_id')
      .eq('id', chamadoId)
      .maybeSingle();

    if (chamadoError || !chamado) {
      throw new Error('Chamado não encontrado ou sem permissão de acesso.');
    }

    if (!isAdmin && chamado.user_id !== user.id) {
      throw new Error('Acesso negado a este chamado.');
    }

    let query = supabase
      .from('chamado_mensagens')
      .select('id, chamado_id, autor_id, autor_nome, autor_tipo, mensagem, created_at')
      .eq('chamado_id', chamadoId);

    if (cursor?.beforeCreatedAt && cursor?.beforeId) {
      z.string().datetime({ offset: true }).parse(cursor.beforeCreatedAt);
      uuidSchema.parse(cursor.beforeId);

      query = query.or(
        `created_at.lt.${cursor.beforeCreatedAt},and(created_at.eq.${cursor.beforeCreatedAt},id.lt.${cursor.beforeId})`
      );
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    if (error) {
      if (error.code === '42P01') {
        console.warn('Tabela chamado_mensagens ainda não existe no Supabase. Retornando lista vazia.');
        return { mensagens: [], hasMore: false };
      }
      throw error;
    }

    const items = (data || []) as ChamadoMensagem[];
    const hasMore = items.length > limit;
    const pageItems = hasMore ? items.slice(0, limit) : items;

    // Determina o cursor com a mensagem mais antiga da consulta decrescente antes de inverter
    const oldestItem = pageItems.length > 0 ? pageItems[pageItems.length - 1] : undefined;
    const nextCursor = hasMore && oldestItem
      ? { beforeCreatedAt: oldestItem.created_at, beforeId: oldestItem.id }
      : undefined;

    // Retorna uma cópia invertida para ordenação cronológica (mais antiga -> mais recente)
    const mensagens = [...pageItems].reverse();

    return { mensagens, hasMore, nextCursor };
  } catch (error) {
    console.error('Erro em obterMensagensDoChamado:', error);
    const message = error instanceof Error ? error.message : 'Erro ao carregar mensagens.';
    throw new Error(message);
  }
}

/**
 * Envia uma mensagem no chat do chamado com proteção de identidade e verificação de status.
 */
export async function enviarMensagemDoChamado(
  chamadoId: string,
  mensagem: string
): Promise<ChamadoMensagem> {
  try {
    uuidSchema.parse(chamadoId);
    const mensagemValida = mensagemSchema.parse(mensagem);

    const { supabase, user, email, isAdmin } = await getAuthenticatedUser();

    // Aplicação de Rate Limit por usuário autenticado
    if (chatRatelimit) {
      const { success } = await chatRatelimit.limit(`ratelimit_chat_${user.id}`);
      if (!success) {
        throw new Error('Muitas mensagens enviadas em pouco tempo. Aguarde alguns segundos.');
      }
    } else {
      const now = Date.now();
      const userLimit = chatRateLimitMap.get(user.id);
      if (!userLimit || now - userLimit.lastReset > CHAT_RATE_LIMIT_WINDOW_MS) {
        chatRateLimitMap.set(user.id, { count: 1, lastReset: now });
      } else {
        if (userLimit.count >= CHAT_RATE_LIMIT) {
          throw new Error('Muitas mensagens enviadas em pouco tempo. Aguarde alguns segundos.');
        }
        userLimit.count += 1;
      }
    }

    // Consulta e validação de status do chamado
    const { data: chamado, error: chamadoError } = await supabase
      .from('chamados')
      .select('id, status, user_id, solicitante')
      .eq('id', chamadoId)
      .maybeSingle();

    if (chamadoError || !chamado) {
      throw new Error('Chamado não encontrado.');
    }

    if (!isAdmin && chamado.user_id !== user.id) {
      throw new Error('Acesso negado a este chamado.');
    }

    // Bloqueio de envio em chamados concluídos (tanto para solicitante quanto para TI)
    if (chamado.status === 'Concluído') {
      throw new Error('Este atendimento foi concluído. Não é possível enviar novas mensagens.');
    }

    const autorNome = isAdmin
      ? 'Equipe de TI'
      : (email ? extractFirstName(email) : (chamado.solicitante || 'Usuário'));
    const autorTipo = isAdmin ? 'ti' : 'usuario';

    const payload = {
      chamado_id: chamadoId,
      autor_id: user.id,
      autor_nome: autorNome,
      autor_tipo: autorTipo,
      mensagem: mensagemValida,
    };

    const { data, error } = await supabase
      .from('chamado_mensagens')
      .insert([payload])
      .select('id, chamado_id, autor_id, autor_nome, autor_tipo, mensagem, created_at')
      .single();

    if (error) {
      if (error.code === '42P01') {
        throw new Error('A tabela do chat ainda não foi criada no banco de dados. Execute a migration 20260828185023_chamado_chat.sql no Supabase.');
      }
      throw error;
    }

    const mensagemCriada = data as ChamadoMensagem;

    // Atualiza imediatamente a última leitura do autor via upsert no banco (com fallback seguro se a tabela não existir)
    try {
      await supabase
        .from('chamado_chat_leituras')
        .upsert({
          chamado_id: chamadoId,
          user_id: user.id,
          last_read_at: mensagemCriada.created_at || new Date().toISOString(),
        }, { onConflict: 'chamado_id,user_id' });
    } catch {
      // Falha silenciosa de leitura caso a tabela ainda não exista
    }

    return mensagemCriada;
  } catch (error) {
    console.error('Erro em enviarMensagemDoChamado:', error);
    const message = error instanceof Error ? error.message : 'Erro ao enviar mensagem.';
    throw new Error(message);
  }
}

/**
 * Marca o chat de um chamado como lido para o usuário autenticado.
 */
export async function marcarChatComoLido(
  chamadoId: string,
  maxMessageCreatedAt?: string
): Promise<{ success: boolean }> {
  try {
    uuidSchema.parse(chamadoId);
    if (maxMessageCreatedAt) {
      z.string().datetime({ offset: true }).parse(maxMessageCreatedAt);
    }

    const { supabase, user, isAdmin } = await getAuthenticatedUser();

    // Confirma acesso
    const { data: chamado } = await supabase
      .from('chamados')
      .select('id, user_id')
      .eq('id', chamadoId)
      .maybeSingle();

    if (!chamado || (!isAdmin && chamado.user_id !== user.id)) {
      throw new Error('Chamado não encontrado ou sem permissão.');
    }

    // Determina o timestamp seguro no servidor
    let lastReadAt = new Date().toISOString();

    if (maxMessageCreatedAt) {
      // Não permite timestamp maior que o horário atual do servidor
      const parsedTime = new Date(maxMessageCreatedAt).getTime();
      const serverTime = Date.now();
      lastReadAt = parsedTime > serverTime ? new Date(serverTime).toISOString() : maxMessageCreatedAt;
    } else {
      // Busca a mensagem mais recente do chamado para usar como referência confiável
      const { data: latestMsg } = await supabase
        .from('chamado_mensagens')
        .select('created_at')
        .eq('chamado_id', chamadoId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestMsg?.created_at) {
        lastReadAt = latestMsg.created_at;
      }
    }

    const { error } = await supabase
      .from('chamado_chat_leituras')
      .upsert({
        chamado_id: chamadoId,
        user_id: user.id,
        last_read_at: lastReadAt,
      }, { onConflict: 'chamado_id,user_id' });

    if (error) {
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('Erro em marcarChatComoLido:', error);
    return { success: false };
  }
}

/**
 * Retorna o mapa de mensagens não lidas por chamado para o usuário conectado.
 */
export async function obterContadoresNaoLidos(): Promise<ContadoresNaoLidos> {
  try {
    const { supabase, user, isAdmin } = await getAuthenticatedUser();

    // 1. Obtém leituras registradas pelo usuário
    const { data: leiturasData, error: leiturasError } = await supabase
      .from('chamado_chat_leituras')
      .select('chamado_id, last_read_at')
      .eq('user_id', user.id);

    if (leiturasError && leiturasError.code === '42P01') {
      return {};
    }

    const mapaLeituras = new Map<string, string>();
    (leiturasData || []).forEach(l => {
      mapaLeituras.set(l.chamado_id, l.last_read_at);
    });

    // 2. Busca mensagens relevantes para contagem
    let query = supabase
      .from('chamado_mensagens')
      .select('id, chamado_id, created_at, autor_id, autor_tipo');

    if (isAdmin) {
      // Para TI, conta mensagens escritas por usuários
      query = query.eq('autor_tipo', 'usuario');
    } else {
      // Para o solicitante, conta mensagens da TI nos seus chamados
      const { data: meusChamados } = await supabase
        .from('chamados')
        .select('id')
        .eq('user_id', user.id);

      const chamadosIds = (meusChamados || []).map(c => c.id);
      if (chamadosIds.length === 0) return {};

      query = query
        .in('chamado_id', chamadosIds)
        .eq('autor_tipo', 'ti');
    }

    const { data: mensagensData, error: mensagensError } = await query;
    if (mensagensError || !mensagensData) return {};

    const contadores: ContadoresNaoLidos = {};

    for (const msg of mensagensData) {
      // Ignora mensagens do próprio usuário caso ocorra
      if (msg.autor_id === user.id) continue;

      const lastRead = mapaLeituras.get(msg.chamado_id);
      const isUnread = !lastRead || new Date(msg.created_at) > new Date(lastRead);

      if (isUnread) {
        contadores[msg.chamado_id] = (contadores[msg.chamado_id] || 0) + 1;
      }
    }

    return contadores;
  } catch (error) {
    console.error('Erro em obterContadoresNaoLidos:', error);
    return {};
  }
}
