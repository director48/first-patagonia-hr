// ─────────────────────────────────────────────────────────────────────────────
// wa-bot — Chatbot HR bidireccional para WhatsApp
//
// Flujo:
//   1. Admin escribe por WA → Green API recibe
//   2. Green API hace POST a esta función (webhook)
//   3. Función consulta Supabase y responde por WA
//
// Deploy: Supabase Dashboard → Edge Functions → New → pegar este código
//         IMPORTANT: desactivar "Verify JWT" (Green API no envía JWT)
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Variables automáticas de Supabase
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://eleammvldfnhoavjslyh.supabase.co'
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// Credenciales Green API — fallback hardcodeado si los Secrets no cargan
const WA_INSTANCE = Deno.env.get('GREEN_API_INSTANCE') ?? '7107643408'
const WA_TOKEN    = Deno.env.get('GREEN_API_TOKEN')    ?? '9d24cc1e42b149e7acaa68213fed35e2448a653de92647c397'
const ADMIN_WA    = Deno.env.get('ADMIN_WA')           ?? '56966165309'

const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Green API ─────────────────────────────────────────────────────────────────
async function sendWA(chatId: string, message: string): Promise<void> {
  const url = `https://api.green-api.com/waInstance${WA_INSTANCE}/sendMessage/${WA_TOKEN}`
  console.log('[wa-bot] sendWA →', chatId, '| instance:', WA_INSTANCE, '| url:', url.slice(0,60))
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, message })
    })
    const data = await res.text()
    console.log('[wa-bot] sendWA response:', res.status, data)
  } catch (e) {
    console.error('[wa-bot] sendWA error:', e)
  }
}

// ── Utilidades ────────────────────────────────────────────────────────────────
// Zona horaria Chile usando Intl (más confiable en Deno que toLocaleString)
const todayStr = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())

// Suma/resta días a una fecha YYYY-MM-DD sin problemas de zona horaria
function shiftDate(base: string, days: number): string {
  const [y, m, d] = base.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

const pad = (n: number) => String(n).padStart(2, '0')

function minsToStr(m: number): string {
  m = Math.round(Math.max(0, m))
  const h = Math.floor(m / 60), min = m % 60
  return h > 0 ? `${h}h${min > 0 ? ` ${min}min` : ''}` : `${min}min`
}

function normalize(s: string): string {
  return s.toLowerCase()
    .replace(/[áä]/g,'a').replace(/[éë]/g,'e')
    .replace(/[íï]/g,'i').replace(/[óö]/g,'o')
    .replace(/[úü]/g,'u').replace(/ñ/g,'n')
}

// ── Empleados ─────────────────────────────────────────────────────────────────
async function getEmployees() {
  const { data } = await sb.from('profiles')
    .select('id,full_name,day_balance,is_active')
    .or('is_active.is.null,is_active.eq.true')
    .order('full_name')
  return data || []
}

function extractEmployee(text: string, employees: any[]) {
  const words = normalize(text).split(/\s+/)
  let best: any = null, bestScore = 0
  for (const e of employees) {
    for (const part of normalize(e.full_name || '').split(' ')) {
      if (part.length > 2 && words.includes(part) && part.length > bestScore) {
        best = e; bestScore = part.length
      }
    }
  }
  return best
}

function extractDateRange(text: string) {
  const t  = normalize(text)
  const td = todayStr()  // YYYY-MM-DD en hora Chile, fiable

  if (t.includes('hoy'))   return { from: td, to: td, label: 'hoy' }
  if (t.includes('ayer'))  return { from: shiftDate(td,-1), to: shiftDate(td,-1), label: 'ayer' }
  if (t.includes('manana')) return { from: shiftDate(td,1), to: shiftDate(td,1), label: 'mañana' }

  // Semana: calcular lunes de la semana actual en base a la fecha chilena
  const [y,m,d] = td.split('-').map(Number)
  const dayOfWeek = new Date(Date.UTC(y,m-1,d)).getUTCDay() || 7  // 1=lun, 7=dom

  if (/semana pasada|ultima semana/.test(t)) {
    const lun = shiftDate(td, -(dayOfWeek + 6))
    const dom = shiftDate(td, -(dayOfWeek))
    return { from: lun, to: dom, label: 'la semana pasada' }
  }
  if (/proxima semana|semana que viene|semana siguiente/.test(t)) {
    const lun = shiftDate(td, 8 - dayOfWeek)
    const dom = shiftDate(td, 14 - dayOfWeek)
    return { from: lun, to: dom, label: 'la próxima semana' }
  }
  if (/esta semana|semana/.test(t)) {
    const lun = shiftDate(td, 1 - dayOfWeek)
    return { from: lun, to: td, label: 'esta semana' }
  }
  if (/mes pasado|ultimo mes/.test(t)) {
    const firstPrev = `${m === 1 ? y-1 : y}-${pad(m===1?12:m-1)}-01`
    const lastPrev  = shiftDate(`${y}-${pad(m)}-01`, -1)
    return { from: firstPrev, to: lastPrev, label: 'el mes pasado' }
  }
  if (/este mes|mes/.test(t)) {
    return { from: `${y}-${pad(m)}-01`, to: td, label: 'este mes' }
  }
  // Fecha específica: "3 de junio"
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  for (let i = 0; i < meses.length; i++) {
    const m = t.match(new RegExp(`(\\d{1,2})\\s+de\\s+${meses[i]}`))
    if (m) {
      const ds = `${now.getFullYear()}-${pad(i+1)}-${pad(parseInt(m[1]))}`
      return { from: ds, to: ds, label: `el ${m[1]} de ${meses[i]}` }
    }
  }
  return { from: td, to: td, label: 'hoy' }
}

// ── Queries ───────────────────────────────────────────────────────────────────

async function queryResumen(): Promise<string> {
  const td = todayStr()
  const [{ data: scheds }, { data: clocks }, { count: dlP }, { count: heP }] = await Promise.all([
    sb.from('schedules')
      .select('employee_id,shift_start,shift_end,profiles(full_name)')
      .eq('date', td).eq('day_type', 'turno'),
    sb.from('clock_records')
      .select('employee_id,clock_in,clock_out').eq('date', td),
    sb.from('time_off_requests').select('*',{count:'exact',head:true}).eq('status','pendiente'),
    sb.from('overtime_records').select('*',{count:'exact',head:true}).eq('status','pendiente')
  ])

  const ckMap: Record<string,any> = {}
  for (const c of clocks || []) ckMap[c.employee_id] = c

  const inside: string[] = [], gone: string[] = [], waiting: string[] = []
  for (const s of scheds || []) {
    const name  = (s.profiles as any)?.full_name || '?'
    const turno = `${(s.shift_start||'').slice(0,5)}–${(s.shift_end||'').slice(0,5)}`
    const c = ckMap[s.employee_id]
    if (c?.clock_in && !c?.clock_out) inside.push(`• ${name} (${turno})`)
    else if (c?.clock_out)            gone.push(`• ${name}`)
    else                              waiting.push(`• ${name} (${turno})`)
  }

  const hoy = new Date().toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long'})
  let msg = `📊 *Resumen del equipo — ${hoy}*\n`
  if (inside.length)   msg += `\n✅ Trabajando (${inside.length}):\n${inside.join('\n')}`
  if (gone.length)     msg += `\n🏠 Ya salieron (${gone.length}):\n${gone.join('\n')}`
  if (waiting.length)  msg += `\n⏳ Sin marcar (${waiting.length}):\n${waiting.join('\n')}`
  if (!scheds?.length) msg += '\nSin turnos asignados hoy.'
  if (dlP || heP)      msg += `\n\n🔔 Pendiente: ${dlP||0} días libres · ${heP||0} HH.EE.`
  return msg
}

async function queryHoras(text: string): Promise<string> {
  const employees = await getEmployees()
  const emp = extractEmployee(text, employees)
  const { from, to, label } = extractDateRange(text)

  let q = (sb.from('clock_records') as any)
    .select('employee_id,clock_in,clock_out,profiles(full_name)')
    .gte('date', from).lte('date', to).not('clock_out','is',null)
  if (emp) q = q.eq('employee_id', emp.id)
  const { data } = await q

  if (!data?.length)
    return emp ? `Sin registros de ${emp.full_name} para ${label}.` : `Sin asistencia para ${label}.`

  const byEmp: Record<string,number> = {}
  for (const r of data) {
    const name = (r.profiles as any)?.full_name || r.employee_id
    byEmp[name] = (byEmp[name] || 0) + (new Date(r.clock_out).getTime() - new Date(r.clock_in).getTime()) / 60000
  }

  if (emp) return `⏱ ${emp.full_name} trabajó *${minsToStr(Object.values(byEmp)[0]||0)}* ${label}.`
  const lines = Object.entries(byEmp).sort((a,b)=>b[1]-a[1]).map(([n,m])=>`• ${n}: ${minsToStr(m)}`).join('\n')
  return `⏱ *Horas trabajadas ${label}:*\n\n${lines}`
}

async function queryTardes(text: string): Promise<string> {
  const employees = await getEmployees()
  const emp = extractEmployee(text, employees)
  const { from, to, label } = extractDateRange(text)

  let sq = (sb.from('schedules') as any)
    .select('employee_id,date,shift_start,profiles(full_name)')
    .gte('date',from).lte('date',to).not('shift_start','is',null).eq('day_type','turno')
  if (emp) sq = sq.eq('employee_id', emp.id)
  const { data: scheds } = await sq
  if (!scheds?.length) return `Sin turnos para ${label}.`

  const ids = [...new Set(scheds.map((s:any)=>s.employee_id))]
  const { data: recs } = await sb.from('clock_records')
    .select('employee_id,date,clock_in').in('employee_id',ids)
    .gte('date',from).lte('date',to).not('clock_in','is',null)

  const clMap: Record<string,any> = {}
  for (const r of recs||[]) clMap[`${r.employee_id}_${r.date}`] = r

  const late: {name:string,date:string,lateMin:number}[] = []
  for (const s of scheds) {
    const r = clMap[`${s.employee_id}_${s.date}`]
    if (!r) continue
    const lateMin = Math.round(
      (new Date(r.clock_in).getTime() - new Date(`${s.date}T${s.shift_start.slice(0,5)}:00`).getTime()) / 60000
    )
    if (lateMin > 15) late.push({ name:(s.profiles as any)?.full_name||'?', date:s.date, lateMin })
  }

  if (!late.length) return `✅ Sin llegadas tarde ${label}.`
  const lines = late.sort((a,b)=>b.lateMin-a.lateMin)
    .map(r=>`• ${r.name}${from!==to?' ('+r.date+')':''}: ${minsToStr(r.lateMin)} tarde`).join('\n')
  return `⚠️ *Llegadas tarde ${label}:*\n\n${lines}`
}

async function queryTurnos(text: string): Promise<string> {
  const employees = await getEmployees()
  const emp = extractEmployee(text, employees)
  const { from, to, label } = extractDateRange(text)

  let q = (sb.from('schedules') as any)
    .select('employee_id,date,shift_start,shift_end,profiles(full_name)')
    .gte('date',from).lte('date',to).eq('day_type', 'turno')
    .order('date').order('shift_start')
  if (emp) q = q.eq('employee_id', emp.id)
  const { data } = await q
  if (!data?.length)
    return emp ? `Sin turno de ${emp.full_name} para ${label}.` : `Sin turnos para ${label}.`

  const { data: clocks } = await sb.from('clock_records')
    .select('employee_id,date,clock_in,clock_out').gte('date',from).lte('date',to)
  const ckMap: Record<string,any> = {}
  for (const c of clocks||[]) ckMap[`${c.employee_id}_${c.date}`] = c

  const lines = data.map((s:any) => {
    const t  = `${(s.shift_start||'').slice(0,5)}–${(s.shift_end||'').slice(0,5)}`
    const c  = ckMap[`${s.employee_id}_${s.date}`]
    const st = c?.clock_in&&!c?.clock_out?' ✅':c?.clock_out?' 🏠':''
    const d  = from!==to?` [${s.date}]`:''
    return `• ${(s.profiles as any)?.full_name||'?'}${d}: ${t}${st}`
  })
  return `📋 *Turnos ${label}:*\n\n${lines.join('\n')}`
}

async function queryAusencias(text: string): Promise<string> {
  const { from, to, label } = extractDateRange(text)
  const { data: scheds } = await sb.from('schedules')
    .select('employee_id,date,profiles(full_name)')
    .gte('date',from).lte('date',to).not('shift_start','is',null).eq('day_type','turno')
  if (!scheds?.length) return `Sin turnos para ${label}.`

  const ids = [...new Set(scheds.map((s:any)=>s.employee_id))]
  const { data: recs } = await sb.from('clock_records')
    .select('employee_id,date').in('employee_id',ids).gte('date',from).lte('date',to)

  const marked = new Set((recs||[]).map((r:any)=>`${r.employee_id}_${r.date}`))
  const absent = scheds.filter((s:any)=>!marked.has(`${s.employee_id}_${s.date}`))
  if (!absent.length) return `✅ Todos marcaron ${label}.`

  const lines = absent.map((s:any)=>
    `• ${(s.profiles as any)?.full_name||'?'}${from!==to?' ('+s.date+')':''}`
  )
  return `❌ *Sin marcaje ${label} (${absent.length}):*\n\n${lines.join('\n')}`
}

async function queryDiasLibres(text: string): Promise<string> {
  const employees = await getEmployees()
  const emp = extractEmployee(text, employees)
  if (emp) return `🗓 ${emp.full_name} tiene *${emp.day_balance||0} día(s) compensatorio(s)* disponibles.`
  const lines = [...employees].sort((a,b)=>(b.day_balance||0)-(a.day_balance||0))
    .map(e=>`• ${e.full_name}: ${e.day_balance||0} días`).join('\n')
  return `🗓 *Saldo compensatorio:*\n\n${lines||'Sin datos'}`
}

async function querySolicitudes(): Promise<string> {
  const [{ data: dl }, { data: he }] = await Promise.all([
    sb.from('time_off_requests')
      .select('start_date,end_date,request_type,profiles(full_name)')
      .eq('status','pendiente').order('start_date'),
    sb.from('overtime_records')
      .select('date,hours,profiles(full_name)')
      .eq('status','pendiente').order('date')
  ])
  if (!dl?.length && !he?.length) return '✅ No hay solicitudes pendientes.'
  let msg = ''
  if (dl?.length) {
    msg += `📅 *Días libres pendientes (${dl.length}):*\n`
    msg += dl.map((r:any)=>
      `• ${(r.profiles as any)?.full_name} — ${r.start_date}${r.end_date!==r.start_date?' → '+r.end_date:''} (${r.request_type})`
    ).join('\n')
  }
  if (he?.length) {
    if (msg) msg += '\n\n'
    msg += `⏰ *HH.EE. pendientes (${he.length}):*\n`
    msg += he.map((r:any)=>`• ${(r.profiles as any)?.full_name} — ${r.date} · ${r.hours}h`).join('\n')
  }
  return msg
}

// ── Dispatcher ────────────────────────────────────────────────────────────────
async function dispatch(text: string): Promise<string> {
  const t = normalize(text)
  if (/resumen|status hoy|estado hoy|equipo hoy|como esta el equipo/.test(t))   return queryResumen()
  if (/solicitud|pendiente|aprobar|hh\.?ee/.test(t))                            return querySolicitudes()
  if (/ausent|no marc|falt|no vino|no trabajo|no asistio/.test(t))              return queryAusencias(text)
  if (/tard[eo]|tardanza|retraso|llego tarde|llegaron tarde/.test(t))            return queryTardes(text)
  if (/hora|trabajo|marco|asistencia|jornada/.test(t))                          return queryHoras(text)
  if (/dia.? libre|vacacion|compensator|saldo|balance/.test(t))                 return queryDiasLibres(text)
  if (/turno|horario|quien trabaja|quien esta|trabaja (hoy|manana|esta)/.test(t)) return queryTurnos(text)
  if (/empleado|personal|equipo|staff|cuantos son/.test(t)) {
    const employees = await getEmployees()
    if (/cuantos|total|cantidad/.test(t)) return `👥 Hay *${employees.length} empleados activos*.`
    return `👥 *Equipo activo (${employees.length}):*\n\n` + employees.map(e=>`• ${e.full_name}`).join('\n')
  }
  return `No entendí la pregunta 🤔\n\nPuedes preguntarme:\n• *Resumen del equipo hoy*\n• *¿Quién llegó tarde?*\n• *Horas trabajadas esta semana*\n• *¿Quién trabaja mañana?*\n• *Solicitudes pendientes*\n• *Saldo de días de [nombre]*\n• *¿Quién no marcó hoy?*`
}

// ── Webhook handler ───────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  // Green API hace ping de verificación con GET
  if (req.method === 'GET') return new Response('ok')
  if (req.method !== 'POST') return new Response('ok')

  let body: any
  try { body = await req.json() } catch { return new Response('ok') }

  // Log completo para debug
  console.log('[wa-bot] webhook:', body.typeWebhook, JSON.stringify(body).slice(0, 300))

  // Solo mensajes entrantes (outgoing desactivado en Green API para evitar loops)
  if (body.typeWebhook !== 'incomingMessageReceived') return new Response('ok')
  if (body.messageData?.typeMessage !== 'textMessage') return new Response('ok')

  // Extraer texto del mensaje
  const messageText = (body.messageData?.textMessageData?.textMessage as string || '').trim()
  if (!messageText) return new Response('ok')

  // Anti-loop: ignorar respuestas del propio bot (cubrir TODOS los formatos posibles)
  const BOT_PREFIXES = ['📊','⏱','⚠️','✅','❌','📋','🗓','📅','👥','🔔','⏰',
                        'Sin turnos','Sin turno','No entendí','Hay ','Error al']
  if (BOT_PREFIXES.some(p => messageText.startsWith(p))) return new Response('ok')

  // Destino de la respuesta: siempre al número del admin (self-chat)
  const replyTo = `${ADMIN_WA}@c.us`
  console.log('[wa-bot] procesando:', messageText.slice(0, 60), '→ reply to:', replyTo)

  // Procesar y responder
  try {
    const response = await dispatch(messageText)
    await sendWA(replyTo, response)
  } catch (e) {
    console.error('[wa-bot]', e)
    await sendWA(replyTo, '❌ Error al consultar. Intenta de nuevo.')
  }

  return new Response('ok')
})
