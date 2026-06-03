// Supabase Edge Function: notify-request
// Triggered via HTTP when a time_off_request or overtime_record is approved/rejected
// Deploy: supabase functions deploy notify-request
// Set secret: supabase secrets set RESEND_API_KEY=re_xxxx

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API = "https://api.resend.com/emails"
const FROM       = "First Patagonia HR <rrhh@firstpatagonia.cl>"

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 })

  const { employee_email, employee_name, type, status, detail, admin_notes } = await req.json()

  if (!employee_email) return new Response("Missing email", { status: 400 })

  const isApproved = status === "aprobado"
  const icon  = isApproved ? "✅" : "❌"
  const color = isApproved ? "#16a34a" : "#dc2626"
  const label = isApproved ? "Aprobado" : "Rechazado"

  const html = `
    <!DOCTYPE html>
    <html><head><meta charset="UTF-8"></head>
    <body style="font-family:'Helvetica Neue',Arial,sans-serif;background:#F0EDE8;padding:32px;color:#111">
      <div style="max-width:520px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.08)">
        <div style="background:#0A0A0A;padding:28px 32px;text-align:center">
          <div style="font-family:Georgia,serif;font-size:22px;color:#F5F2EC;letter-spacing:.04em">First Patagonia</div>
          <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.4);margin-top:4px">Control de RRHH</div>
        </div>
        <div style="padding:32px">
          <p style="margin:0 0 16px;font-size:15px">Hola <strong>${employee_name}</strong>,</p>
          <div style="background:${isApproved ? "#f0fdf4" : "#fef2f2"};border:1.5px solid ${color};border-radius:8px;padding:20px;margin-bottom:20px;text-align:center">
            <div style="font-size:2rem;margin-bottom:8px">${icon}</div>
            <div style="font-size:18px;font-weight:700;color:${color}">${label}</div>
            <div style="font-size:13px;color:#555;margin-top:6px">${detail}</div>
          </div>
          ${admin_notes ? `<div style="background:#f5f5f5;border-radius:6px;padding:12px 16px;font-size:13px;color:#555"><strong>Nota del administrador:</strong><br>${admin_notes}</div>` : ""}
          <p style="font-size:12px;color:#999;margin-top:24px;border-top:1px solid #eee;padding-top:16px">
            Hotel Petrohué · Ruta 225 Km 58, Puerto Varas<br>
            Este mensaje fue generado automáticamente.
          </p>
        </div>
      </div>
    </body></html>
  `

  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`
    },
    body: JSON.stringify({
      from:    FROM,
      to:      [employee_email],
      subject: `${icon} Tu solicitud fue ${label.toLowerCase()} — First Patagonia`,
      html
    })
  })

  if (!res.ok) {
    const err = await res.text()
    return new Response(JSON.stringify({ error: err }), { status: 500 })
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
})
