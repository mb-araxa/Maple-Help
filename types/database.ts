export type ChamadoPriority = 'baixa' | 'normal' | 'alta' | 'critica';
export type ChamadoArea = 'ti' | 'manutencao';
export type ChamadoStatus = 'Pendente' | 'Em Andamento' | 'Aguardando Solicitante' | 'Concluído' | 'Reaberto' | 'Cancelado';

export interface Chamado {
  id: string; // uuid
  solicitante: string;
  local: string;
  categoria: string;
  descricao: string;
  status: ChamadoStatus;
  
  area: ChamadoArea;
  priority: ChamadoPriority;
  impact?: string | null;
  
  assigned_to?: string | null; // uuid
  assigned_at?: string | null; // timestamptz
  due_at?: string | null; // timestamptz
  first_response_at?: string | null; // timestamptz
  reopened_at?: string | null; // timestamptz
  closed_by?: string | null; // uuid
  closed_at?: string | null; // timestamptz
  deleted_at?: string | null; // timestamptz
  
  resolucao: string | null;
  data_criacao: string; // timestamptz
  data_resolucao: string | null; // timestamptz
  responsavel: string | null;
  tempo_gasto: string | null; // ex: '30m', '1h 30m'
  anexo_url?: string | null; // Storage path ou URL
  user_id?: string; // ID do usuário que abriu o chamado (Supabase Auth)
}

export interface ChamadoEvento {
  id: string;
  chamado_id: string;
  actor_id: string | null;
  event_type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  previous_value: Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new_value: Record<string, any> | null;
  description: string;
  created_at: string;
}

export interface ChamadoMensagem {
  id: string;
  chamado_id: string;
  author_id: string | null;
  message: string;
  is_internal: boolean;
  created_at: string;
  updated_at: string | null;
}
