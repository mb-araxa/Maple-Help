-- 1. Expand chamados table
ALTER TABLE public.chamados 
  ADD COLUMN area text NOT NULL DEFAULT 'ti',
  ADD COLUMN priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN impact text,
  ADD COLUMN assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN assigned_at timestamptz,
  ADD COLUMN due_at timestamptz,
  ADD COLUMN first_response_at timestamptz,
  ADD COLUMN reopened_at timestamptz,
  ADD COLUMN closed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN closed_at timestamptz,
  ADD COLUMN deleted_at timestamptz;

-- Ensure constraints for enum-like values
ALTER TABLE public.chamados 
  ADD CONSTRAINT chamados_area_check CHECK (area IN ('ti', 'manutencao')),
  ADD CONSTRAINT chamados_priority_check CHECK (priority IN ('baixa', 'normal', 'alta', 'critica')),
  ADD CONSTRAINT chamados_status_check CHECK (status IN ('Pendente', 'Em Andamento', 'Aguardando Solicitante', 'Concluído', 'Reaberto', 'Cancelado'));

-- Migrate existing nulls (if any issue) to defaults
UPDATE public.chamados SET area = 'ti' WHERE area IS NULL;
UPDATE public.chamados SET priority = 'normal' WHERE priority IS NULL;

-- Create Indexes for performance and filtering
CREATE INDEX idx_chamados_user_created ON public.chamados(user_id, data_criacao);
CREATE INDEX idx_chamados_status_due ON public.chamados(status, due_at);
CREATE INDEX idx_chamados_area_priority ON public.chamados(area, priority);
CREATE INDEX idx_chamados_assigned_to ON public.chamados(assigned_to);

-- 2. Create chamado_eventos table (Audit Log)
CREATE TABLE IF NOT EXISTS public.chamado_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chamado_id uuid NOT NULL REFERENCES public.chamados(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  previous_value jsonb,
  new_value jsonb,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS for chamado_eventos
ALTER TABLE public.chamado_eventos ENABLE ROW LEVEL SECURITY;

-- Requesters can see events for their own tickets
CREATE POLICY "Requesters can view events for their tickets" 
  ON public.chamado_eventos 
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.chamados c 
      WHERE c.id = chamado_eventos.chamado_id AND c.user_id = auth.uid()
    )
  );

-- Admins and technicians can see all events
CREATE POLICY "Admins and technicians can view all events" 
  ON public.chamado_eventos 
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'technician')
    )
  );

-- Insert policies for chamado_eventos
CREATE POLICY "Users can insert events for their allowed tickets" 
  ON public.chamado_eventos 
  FOR INSERT 
  WITH CHECK (
    -- Admin and tech can insert on any
    EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'technician')
    )
    OR
    -- Requester can insert on their own ticket
    EXISTS (
      SELECT 1 FROM public.chamados c 
      WHERE c.id = chamado_eventos.chamado_id AND c.user_id = auth.uid()
    )
  );

-- No updates or deletes allowed on audit logs
-- (Omitted update and delete policies means they default to denied)

-- 3. Create chamado_mensagens table
CREATE TABLE IF NOT EXISTS public.chamado_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chamado_id uuid NOT NULL REFERENCES public.chamados(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  message text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX idx_mensagens_chamado_created ON public.chamado_mensagens(chamado_id, created_at);

-- RLS for chamado_mensagens
ALTER TABLE public.chamado_mensagens ENABLE ROW LEVEL SECURITY;

-- Requesters can see public messages on their own tickets
CREATE POLICY "Requesters can view public messages for their tickets" 
  ON public.chamado_mensagens 
  FOR SELECT 
  USING (
    is_internal = false AND
    EXISTS (
      SELECT 1 FROM public.chamados c 
      WHERE c.id = chamado_mensagens.chamado_id AND c.user_id = auth.uid()
    )
  );

-- Admins and technicians can see all messages (public and internal)
CREATE POLICY "Admins and technicians can view all messages" 
  ON public.chamado_mensagens 
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'technician')
    )
  );

-- Requesters can insert public messages on their tickets
CREATE POLICY "Requesters can insert public messages" 
  ON public.chamado_mensagens 
  FOR INSERT 
  WITH CHECK (
    is_internal = false AND author_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.chamados c 
      WHERE c.id = chamado_mensagens.chamado_id AND c.user_id = auth.uid()
    )
  );

-- Admins and tech can insert any message type on any ticket
CREATE POLICY "Admins and technicians can insert messages" 
  ON public.chamado_mensagens 
  FOR INSERT 
  WITH CHECK (
    author_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'technician')
    )
  );

-- Only authors can update their own messages
CREATE POLICY "Authors can update their own messages" 
  ON public.chamado_mensagens 
  FOR UPDATE 
  USING (author_id = auth.uid());

-- RLS Updates on chamados table
-- (Ensuring requesters can only see their own tickets, tech/admin see all)
ALTER TABLE public.chamados ENABLE ROW LEVEL SECURITY;

-- Requesters can view their own
CREATE POLICY "Requesters can view their own chamados" 
  ON public.chamados 
  FOR SELECT 
  USING (user_id = auth.uid());

-- Tech and Admin can view all
CREATE POLICY "Admins and technicians can view all chamados" 
  ON public.chamados 
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'technician')
    )
  );

-- Requesters can insert their own
CREATE POLICY "Requesters can insert own chamados" 
  ON public.chamados 
  FOR INSERT 
  WITH CHECK (user_id = auth.uid());

-- Admins and tech can insert on behalf of others if needed
CREATE POLICY "Admins and technicians can insert chamados" 
  ON public.chamados 
  FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'technician')
    )
  );

-- Requesters can only update limited fields of their own tickets (e.g. status to cancel, but usually server actions bypass this via service_role. We'll use authenticated requests so we must allow specific updates)
-- We'll allow requesters to update their own tickets and rely on Server Actions for strict column validation
CREATE POLICY "Requesters can update their own chamados" 
  ON public.chamados 
  FOR UPDATE 
  USING (user_id = auth.uid());

CREATE POLICY "Admins and technicians can update any chamado" 
  ON public.chamados 
  FOR UPDATE 
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'technician')
    )
  );
