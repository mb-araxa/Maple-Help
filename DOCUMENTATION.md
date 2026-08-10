# Documentação do Projeto: Maple Help

## Testes Manuais de RLS (Homologação)

Para garantir que o Row Level Security (RLS) esteja funcionando perfeitamente, siga este roteiro no painel do Supabase do seu ambiente de homologação, utilizando a aba **SQL Editor** ou impersonificando usuários.

### Pré-requisitos
Tenha 3 usuários de teste cadastrados no Supabase Auth:
- `user_solicitante@teste.com` (Papel: `requester`)
- `user_tecnico@teste.com` (Papel: `technician`)
- `user_admin@teste.com` (Papel: `admin`)

### Cenário 1: Isolamento de Chamados (Solicitante)
1. Faça login como `user_solicitante@teste.com` (ou simule o token JWT).
2. Tente consultar a tabela `chamados`:
   ```sql
   select * from chamados;
   ```
3. **Resultado Esperado:** Apenas os chamados criados por este `user_id` devem ser retornados. Chamados de outros solicitantes não devem aparecer.

### Cenário 2: Visão Global (Técnico e Admin)
1. Faça login como `user_tecnico@teste.com` ou `user_admin@teste.com`.
2. Consulte a tabela `chamados`:
   ```sql
   select * from chamados;
   ```
3. **Resultado Esperado:** Todos os chamados do sistema devem ser listados.

### Cenário 3: Privacidade de Mensagens Internas
1. Como `user_admin@teste.com`, crie uma mensagem em um chamado qualquer definindo `is_internal = true`.
2. Como `user_solicitante@teste.com` (dono do chamado), tente consultar a tabela `chamado_mensagens`:
   ```sql
   select * from chamado_mensagens where chamado_id = 'ID_DO_CHAMADO';
   ```
3. **Resultado Esperado:** A mensagem interna **NÃO** deve ser retornada. Apenas mensagens públicas (`is_internal = false`).

### Cenário 4: Segurança de Uploads (Storage)
1. Como `user_solicitante@teste.com`, tente listar objetos do bucket `chamados-anexos` em pastas de outros usuários:
   - A resposta da API deve retornar vazio ou negado (devido à política do RLS baseada em `auth.uid() = foldername[1]`).
2. Como admin ou técnico, a listagem/leitura em qualquer subpasta do bucket `chamados-anexos` deve ser permitida.

### Cenário 5: Proteção contra Mudança de Papel (Role)
1. Como `user_solicitante@teste.com`, tente executar um UPDATE no próprio perfil:
   ```sql
   update profiles set role = 'admin' where id = auth.uid();
   ```
2. **Resultado Esperado:** A trigger `protect_role_update` deve reverter a role silenciosamente ou a query passará sem alterar a coluna `role` real, pois o usuário não é `admin`.

## Integra��o de E-mails (Resend) - Prepara��o Entrega 2

A **Entrega 2** introduzir� notifica��es via e-mail utilizando a plataforma [Resend](https://resend.com).

### Pr�-requisitos
1. Uma conta no Resend.
2. Um dom�nio verificado no painel do Resend (ex: maplebeararaxa.com.br). O envio por dom�nios n�o verificados s� � permitido para o pr�prio e-mail da conta do Resend.

### Vari�veis de Ambiente Necess�rias
Adicione a seguinte vari�vel no seu .env.local (e no ambiente de produ��o da Vercel):
\\\env
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
NEXT_PUBLIC_APP_URL=https://seu-dominio.com.br
\\\
*(A NEXT_PUBLIC_APP_URL � essencial para montar os links nos bot�es do e-mail apontando para os detalhes do chamado).*

### Fluxo de Envio Ass�ncrono
1. Ao mudar o status ou adicionar uma mensagem num chamado, a *Server Action* invoca o m�todo de envio (ainda a ser implementado).
2. O envio de e-mails ocorrer� de forma **n�o-bloqueante**, para n�o atrasar a resposta da interface ao usu�rio.
3. Os templates de e-mail ser�o constru�dos usando React Email ou templates HTML puros da pr�pria plataforma Resend.

