// Supabase Edge Function: send-whatsapp
// Envía mensajes de WhatsApp al administrador vía Green API (gratis, 3000 msg/mes)
//
// Setup:
//   1. Crea cuenta en green-api.com/en
//   2. Crea una instancia y escanea el QR con tu WhatsApp
//   3. Copia idInstance y apiTokenInstance
//   4. Configura secrets:
//      supabase secrets set GREEN_API_INSTANCE=7103... GREEN_API_TOKEN=abc123... ADMIN_WA=56984644870
//   5. Despliega:
//      supabase functions deploy send-whatsapp --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return new Response('Method not allowed', { status: 405, headers: CORS })

  const instance = Deno.env.get('GREEN_API_INSTANCE')
  const token    = Deno.env.get('GREEN_API_TOKEN')
  const adminWA  = Deno.env.get('ADMIN_WA')  // solo dígitos, ej: 56984644870

  // Si no está configurado, responde OK silencioso (no bloquea el flujo)
  if (!instance || !token || !adminWA) {
    return new Response(JSON.stringify({ ok: false, reason: 'not_configured' }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  }

  let body
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ ok: false, reason: 'invalid_json' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  }

  const { message } = body
  if (!message) return new Response(JSON.stringify({ ok: false, reason: 'no_message' }), {
    status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
  })

  const chatId = `${adminWA}@c.us`

  const res = await fetch(
    `https://api.green-api.com/waInstance${instance}/sendMessage/${token}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chatId, message })
    }
  )

  const data = await res.json().catch(() => ({}))
  return new Response(JSON.stringify({ ok: res.ok, data }), {
    status: 200, headers: { ...CORS, 'Content-Type': 'application/json' }
  })
})
