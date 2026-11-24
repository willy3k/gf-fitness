// Recebe avisos do Mercado Pago e libera o aluno quando o pagamento é aprovado.
//
// Segurança em duas camadas:
//  1) valida a assinatura (x-signature) quando MP_WEBHOOK_SECRET está configurado;
//  2) NUNCA confia no corpo do aviso: consulta o pagamento direto na API do
//     Mercado Pago antes de liberar qualquer coisa.
//
// Deploy (sem JWT, pois quem chama é o Mercado Pago):
//   supabase functions deploy webhook-mercadopago --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MP_API = 'https://api.mercadopago.com'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function hmacHex(secret: string, data: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const ok = (msg = 'ok') => new Response(msg, { status: 200 })

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url)
    let body: any = {}
    try {
      body = await req.json()
    } catch {
      /* alguns avisos vêm só com query string */
    }

    const tipo = body.type ?? url.searchParams.get('type') ?? url.searchParams.get('topic')
    const dataId = String(body?.data?.id ?? url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? '')

    // 1) Assinatura
    const secret = Deno.env.get('MP_WEBHOOK_SECRET')
    if (secret) {
      const cab = req.headers.get('x-signature') ?? ''
      const partes = Object.fromEntries(
        cab.split(',').map((p) => p.trim().split('=') as [string, string]),
      )
      const idAssinatura = (url.searchParams.get('data.id') ?? dataId).toLowerCase()
      const manifesto = `id:${idAssinatura};request-id:${req.headers.get('x-request-id') ?? ''};ts:${partes.ts};`
      const esperado = await hmacHex(secret, manifesto)
      if (!partes.v1 || esperado !== partes.v1) {
        console.warn('Assinatura inválida')
        return new Response('assinatura inválida', { status: 401 })
      }
    }

    if (tipo !== 'payment' || !dataId) return ok('ignorado')

    // 2) Consulta o pagamento direto no Mercado Pago
    const mpToken = Deno.env.get('MP_ACCESS_TOKEN')!
    const r = await fetch(`${MP_API}/v1/payments/${dataId}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    })
    if (r.status === 404) return ok('pagamento inexistente (teste?)')
    if (!r.ok) return new Response('falha ao consultar pagamento', { status: 502 }) // MP tenta de novo
    const p = await r.json()

    const alunoId = p.external_reference
    if (!alunoId || !UUID.test(alunoId)) return ok('sem referência de aluno')

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    if (p.status === 'approved') {
      const { error } = await admin.rpc('confirmar_pagamento', {
        p_mp_payment_id: String(p.id),
        p_aluno: alunoId,
        p_valor: p.transaction_amount,
        p_metodo: p.payment_method_id === 'pix' ? 'pix' : 'cartao',
      })
      if (error) {
        console.error('confirmar_pagamento falhou', error)
        return new Response('erro ao confirmar', { status: 500 }) // MP tenta de novo
      }
    } else if (p.status === 'rejected' || p.status === 'cancelled') {
      await admin
        .from('pagamentos')
        .update({ status: p.status === 'rejected' ? 'recusado' : 'cancelado' })
        .eq('mp_payment_id', String(p.id))
        .eq('status', 'pendente')
    }

    return ok()
  } catch (e) {
    console.error(e)
    return new Response('erro interno', { status: 500 })
  }
})
