# Academia — Pré-agendamento + Mensalidades + Recepção

Sistema em 3 partes:

1. **Página pública de pré-agendamento** (`/`) — captura leads para a abertura.
2. **Painel da equipe** (login) — Recepção (consulta "cadastrado e em dia?"), Alunos (cadastro e cobrança) e Leads.
3. **Cobrança automática** — Pix e cartão via Mercado Pago; o pagamento aprovado renova o vencimento sozinho.

Catraca: **sem integração**. O recepcionista digita CPF/nome em `/recepcao`, vê **LIBERADO** (verde) ou **BLOQUEADO** (vermelho) e libera manualmente.

## Stack

React 18 + Vite · Supabase (Postgres, Auth, Edge Functions) · Mercado Pago · hospedagem do front na Vercel (ou Netlify).

## Estrutura

```
academia-app/
├─ src/
│  ├─ pages/ (PreAgendamento, Login, Recepcao, Alunos, Leads)
│  ├─ components/ (RequireAuth, StaffLayout)
│  └─ lib/ (supabase.js, format.js)
└─ supabase/
   ├─ schema.sql                      ← tabelas, regras de acesso, funções
   └─ functions/
      ├─ criar-cobranca/              ← gera Pix / assinatura cartão
      └─ webhook-mercadopago/         ← confirma pagamento e renova aluno
```

## Passo a passo

### 1. Supabase
1. Crie um projeto em supabase.com.
2. **SQL Editor** → cole e rode `supabase/schema.sql`.
3. **Authentication → Providers → Email**: desative "Allow new users to sign up" (só a equipe entra).
4. **Authentication → Users → Add user**: crie o usuário da recepção/dono.
5. No SQL Editor, autorize esse usuário:
   ```sql
   insert into staff (user_id, nome, papel)
   select id, 'Seu Nome', 'admin' from auth.users where email = 'seu@email.com';
   ```

### 2. Front-end local
```bash
cp .env.example .env     # preencha URL e chave anon do Supabase
npm install
npm run dev
```

### 3. Mercado Pago
1. Crie uma aplicação em mercadopago.com.br/developers e pegue o **Access Token** (use o de **teste** primeiro).
2. Instale a CLI do Supabase e vincule o projeto:
   ```bash
   supabase login
   supabase link --project-ref SEU_REF
   supabase secrets set MP_ACCESS_TOKEN=... APP_URL=https://seu-dominio.com MP_WEBHOOK_SECRET=...
   supabase functions deploy criar-cobranca
   supabase functions deploy webhook-mercadopago --no-verify-jwt
   ```
3. No painel do Mercado Pago → **Webhooks**: URL `https://SEU_REF.supabase.co/functions/v1/webhook-mercadopago`, evento **Pagamentos** (e **Planos e assinaturas**). Copie a "assinatura secreta" para `MP_WEBHOOK_SECRET`.

### 4. Publicar o front
Suba o repositório na Vercel, configure as variáveis `VITE_*` e faça o deploy. O `vercel.json` já resolve as rotas.

## Como funciona o fluxo do aluno

1. **Alunos → + Novo aluno**: o aluno nasce **bloqueado** (vencimento = ontem).
2. **Cobrar Pix**: aparece QR Code / copia e cola → aluno paga → webhook aprova → vencimento passa a ser +1 mês.
3. **Assinatura cartão**: envie o link ao aluno; ele cadastra o cartão uma vez e as mensalidades seguintes são cobradas automaticamente, cada uma renovando o vencimento.
4. **Pago em dinheiro**: botão registra o pagamento e renova.
5. **Recepção**: consulta por CPF/nome; só mostra LIBERADO se `status = ativo` e vencimento (+ tolerância) não passou. "Registrar entrada" grava o acesso (auditoria).

## Pontos de atenção (leia antes de ir para produção)

- **Pix "automático"**: a cobrança por Pix é gerada a cada mês pela equipe (botão *Cobrar Pix*); só o **cartão** é recorrente de verdade. Se quiser Pix recorrente, avalie a oferta de Pix Automático do seu provedor.
- **Teste em sandbox primeiro**: valide o fluxo completo com credenciais de teste, em especial se os pagamentos de assinatura chegam com `external_reference` do aluno (o webhook depende disso para saber quem pagou).
- **LGPD**: o sistema guarda CPF e contato. Mantenha o cadastro público de usuários desligado, use senha forte na equipe, publique uma política de privacidade e atenda pedidos de exclusão (`delete from alunos where id = ...`).
- **Tolerância**: a coluna `tolerancia_dias` (padrão 0) permite dar carência por aluno.
- **Backups**: ative backups diários no Supabase (plano pago) antes de operar com alunos reais.
