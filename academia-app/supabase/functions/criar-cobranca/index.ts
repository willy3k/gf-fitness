// Gera cobrança de mensalidade no Mercado Pago.
//  - metodo "pix":    cria um pagamento Pix (QR Code + copia e cola)
//  - metodo "cartao": cria uma assinatura mensal (o aluno cadastra o cartão uma vez
//                     pelo link e as próximas mensalidades são cobradas automaticamente)
//
// Só a equipe (tabela `staff`) pode chamar. Deploy: supabase functions deploy criar-cobranca

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const MP_API = 'https://api.mercadopago.com'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const mpToken = Deno.env.get('MP_ACCESS_TOKEN')
    const appUrl = Deno.env.get('APP_URL')
    if (!mpToken || !appUrl) {
      return json({ error: 'Servidor sem MP_ACCESS_TOKEN / APP_URL configurados.' }, 500)
    }

    // 1) Quem chamou precisa ser da equipe.
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: staff } = await userClient.rpc('is_staff')
    if (staff !== true) return json({ error: 'Não autorizado.' }, 403)

    // 2) Valida entrada.
    const { aluno_id, metodo } = await req.json()
    if (!aluno_id || !['pix', 'cartao'].includes(metodo)) {
      return json({ error: 'Parâmetros inválidos.' }, 400)
    }

    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: aluno, error } = await admin.from('alunos').select('*').eq('id', aluno_id).single()
    if (error || !aluno) return json({ error: 'Aluno não encontrado.' }, 404)
    if (!aluno.email) return json({ error: 'Cadastre o e-mail do aluno antes de gerar a cobrança.' }, 400)

    const valor = Number(aluno.valor_mensalidade)
    const headers = { Authorization: `Bearer ${mpToken}`, 'Content-Type': 'application/json' }

    // 3a) Pix avulso
    if (metodo === 'pix') {
      const r = await fetch(`${MP_API}/v1/payments`, {
        method: 'POST',
        headers: { ...headers, 'X-Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({
          transaction_amount: valor,
          description: `Mensalidade - ${aluno.nome}`,
          payment_method_id: 'pix',
          payer: { email: aluno.email, first_name: String(aluno.nome).split(' ')[0] },
          external_reference: aluno.id,
          notification_url: `${supabaseUrl}/functions/v1/webhook-mercadopago`,
        }),
      })
      const p = await r.json()
      if (!r.ok) return json({ error: 'O Mercado Pago recusou a cobrança.', detalhe: p }, 502)

      const tx = p.point_of_interaction?.transaction_data ?? {}
      await admin.from('pagamentos').insert({
        aluno_id: aluno.id,
        valor,
        metodo: 'pix',
        status: 'pendente',
        mp_payment_id: String(p.id),
      })

      return json({
        metodo: 'pix',
        valor,
        qr_code: tx.qr_code,
        qr_code_base64: tx.qr_code_base64,
        ticket_url: tx.ticket_url,
      })
    }

    // 3b) Assinatura mensal no cartão
    const r = await fetch(`${MP_API}/preapproval`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        reason: `Mensalidade - ${aluno.nome}`,
        external_reference: aluno.id,
        payer_email: aluno.email,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: valor,
          currency_id: 'BRL',
        },
        back_url: appUrl,
        status: 'pending',
      }),
    })
    const s = await r.json()
    if (!r.ok) return json({ error: 'O Mercado Pago recusou a assinatura.', detalhe: s }, 502)

    await admin.from('alunos').update({ mp_preapproval_id: s.id }).eq('id', aluno.id)
    return json({ metodo: 'cartao', valor, init_point: s.init_point })
  } catch (e) {
    console.error(e)
    return json({ error: 'Erro interno ao gerar a cobrança.' }, 500)
  }
})
