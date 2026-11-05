export interface AvaliacaoChamado {
  chamado_id: string;
  nota: number;
  comentario: string | null;
  created_at: string;
}

export interface Chamado {
  id: string; // uuid
  solicitante: string;
  local: string;
  categoria: string;
  descricao: string;
  status: string; // default 'Pendente'
  resolucao: string | null;
  data_criacao: string; // timestamptz
  data_resolucao: string | null; // timestamptz
  responsavel: string | null;
  tempo_gasto: string | null; // ex: '30m', '1h 30m'
  anexo_url?: string | null; // URL pública ou assinada da imagem no storage
  user_id?: string; // ID do usuário que abriu o chamado (Supabase Auth)
  avaliacao?: AvaliacaoChamado | null;
  prioridade?: import('@/lib/sla').Prioridade | null;
  sla_prazo_horas?: number | null;
  sla_vence_em?: string | null;
  origem?: 'portal' | 'email';
  email_remetente?: string | null;
  email_assunto?: string | null;
  email_message_id?: string | null;
  email_original_path?: string | null;
}

export type AutorTipo = 'usuario' | 'ti';

export interface ChamadoMensagem {
  id: string; // uuid
  chamado_id: string; // uuid
  autor_id: string | null; // uuid do usuário no Supabase Auth ou null se excluído
  autor_nome: string;
  autor_tipo: AutorTipo;
  mensagem: string;
  created_at: string; // timestamptz
}

export interface ChamadoChatLeitura {
  chamado_id: string;
  user_id: string;
  last_read_at: string; // timestamptz
}

export type ContadoresNaoLidos = Record<string, number>;

export interface CursorPaginacaoChat {
  beforeCreatedAt: string;
  beforeId: string;
}

export interface AppAdmin {
  email: string;
  created_at: string;
}
