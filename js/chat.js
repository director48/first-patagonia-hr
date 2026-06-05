'use strict'
// ──────────────────────────────────────────────────────────────────────────────
// HR Chat Assistant — consultas en lenguaje natural sobre datos del equipo
// Sólo visible para role === 'admin'. Llamado desde auth.js → initPage().
// No requiere API externa: reconoce patrones en español y consulta Supabase.
// ──────────────────────────────────────────────────────────────────────────────

window.initChat = function initChat(adminProfile) {

  // ── Estilos ──────────────────────────────────────────────────────────────────
  const style = document.createElement('style')
  style.textContent = `
    #hrChatBtn {
      position:fixed; bottom:2rem; right:2rem; z-index:9999;
      width:52px; height:52px; border-radius:50%;
      background:var(--teal,#00B8A9); border:none; cursor:pointer;
      display:flex; align-items:center; justify-content:center;
      font-size:1.3rem; box-shadow:0 4px 20px rgba(0,184,169,.45);
      transition:transform .18s, box-shadow .18s;
    }
    #hrChatBtn:hover { transform:scale(1.1); box-shadow:0 6px 28px rgba(0,184,169,.6); }
    #hrChatPanel {
      position:fixed; bottom:6.5rem; right:2rem; z-index:9999;
      width:340px; max-height:540px;
      background:#111; border:1px solid rgba(255,255,255,.1);
      border-radius:14px; display:none; flex-direction:column;
      box-shadow:0 12px 40px rgba(0,0,0,.7); overflow:hidden;
      font-family:'Jost',sans-serif;
    }
    @keyframes chatIn {
      from { opacity:0; transform:translateY(12px) scale(.97); }
      to   { opacity:1; transform:translateY(0) scale(1); }
    }
    /* BUG-5 fix: animación en .open para que se reproduzca en cada apertura */
    #hrChatPanel.open { display:flex; animation: chatIn .22s ease; }
    #hrChatHead {
      padding:.7rem 1rem; background:var(--teal,#00B8A9);
      color:#0A0A0A; font-weight:600; font-size:.88rem;
      display:flex; justify-content:space-between; align-items:center;
      flex-shrink:0;
    }
    #hrChatHead span { display:flex; align-items:center; gap:.4rem; }
    #hrChatClose {
      background:none; border:none; cursor:pointer;
      font-size:1rem; color:#0A0A0A; line-height:1; padding:2px 4px;
      border-radius:4px; transition:background .15s;
    }
    #hrChatClose:hover { background:rgba(0,0,0,.15); }
    #hrChatMsgs {
      flex:1; overflow-y:auto; padding:.75rem .75rem .5rem;
      display:flex; flex-direction:column; gap:.5rem;
      scrollbar-width:thin; scrollbar-color:rgba(255,255,255,.1) transparent;
    }
    .hrc-msg {
      max-width:90%; padding:.5rem .75rem; border-radius:8px;
      font-size:.8rem; line-height:1.5; white-space:pre-wrap;
      word-break:break-word;
    }
    .hrc-msg.user { align-self:flex-end; background:#1e1e1e; color:#F5F2EC; }
    .hrc-msg.bot  {
      align-self:flex-start;
      background:rgba(0,184,169,.12); color:#e8e5df;
      border:1px solid rgba(0,184,169,.22);
    }
    .hrc-msg.loading { opacity:.55; }
    .hrc-hint {
      font-size:.72rem; color:rgba(245,242,236,.28);
      text-align:center; padding:.2rem 0;
    }
    .hrc-chip {
      display:inline-block; background:rgba(0,184,169,.15);
      border:1px solid rgba(0,184,169,.3); border-radius:20px;
      padding:.22rem .6rem; font-size:.72rem; color:var(--teal,#00B8A9);
      cursor:pointer; transition:background .15s; margin:.15rem .1rem;
      white-space:nowrap;
    }
    .hrc-chip:hover { background:rgba(0,184,169,.28); }
    .hrc-chips { padding:.1rem 0 .3rem; }
    #hrChatFoot {
      padding:.55rem .65rem; border-top:1px solid rgba(255,255,255,.07);
      display:flex; gap:.4rem; flex-shrink:0;
    }
    #hrChatInput {
      flex:1; background:#1a1a1a; border:1px solid rgba(255,255,255,.12);
      border-radius:7px; color:#F5F2EC; padding:.42rem .65rem;
      font-size:.8rem; font-family:'Jost',sans-serif; outline:none;
      transition:border-color .2s;
    }
    #hrChatInput:focus { border-color:rgba(0,184,169,.5); }
    #hrChatInput::placeholder { color:rgba(245,242,236,.28); }
    #hrChatSend {
      background:var(--teal,#00B8A9); border:none; border-radius:7px;
      color:#0A0A0A; font-weight:700; padding:.42rem .85rem;
      cursor:pointer; font-size:.82rem; transition:opacity .15s;
    }
    #hrChatSend:hover { opacity:.82; }
    #hrChatSend:disabled { opacity:.4; cursor:default; }
  `
  document.head.appendChild(style)

  const firstName = (adminProfile?.full_name || '').split(' ')[0] || 'Admin'

  // BUG-6 fix: chips en una sola línea → pre-wrap no añade línea en blanco extra
  const welcomeChips = '<div class="hrc-chips"><span class="hrc-chip" data-q="Resumen del equipo hoy">📊 Resumen hoy</span><span class="hrc-chip" data-q="¿Quién llegó tarde esta semana?">⚠️ Tardanzas</span><span class="hrc-chip" data-q="¿Qué solicitudes hay pendientes?">🔔 Pendientes</span><span class="hrc-chip" data-q="¿Quién trabaja hoy?">📋 Turnos hoy</span></div>'

  document.body.insertAdjacentHTML('beforeend', `
    <button id="hrChatBtn" title="Asistente HR — consulta datos del equipo">🤖</button>
    <div id="hrChatPanel">
      <div id="hrChatHead">
        <span>🤖 Asistente HR</span>
        <button id="hrChatClose" title="Cerrar">✕</button>
      </div>
      <div id="hrChatMsgs">
        <div class="hrc-msg bot">Hola <strong>${firstName}</strong> 👋 Puedo consultar datos del equipo en tiempo real. Prueba con:${welcomeChips}</div>
        <div class="hrc-hint">Escribe o toca un chip para comenzar</div>
      </div>
      <div id="hrChatFoot">
        <input id="hrChatInput" placeholder="Pregunta sobre el equipo…" autocomplete="off">
        <button id="hrChatSend">→</button>
      </div>
    </div>
  `)

  // ── Toggle ───────────────────────────────────────────────────────────────────
  document.getElementById('hrChatBtn').onclick = () =>
    document.getElementById('hrChatPanel').classList.toggle('open')
  document.getElementById('hrChatClose').onclick = () =>
    document.getElementById('hrChatPanel').classList.remove('open')

  // Chips de sugerencia
  document.getElementById('hrChatMsgs').addEventListener('click', e => {
    const chip = e.target.closest('.hrc-chip')
    if (chip) { document.getElementById('hrChatInput').value = chip.dataset.q; send() }
  })

  // ── Caché de empleados ───────────────────────────────────────────────────────
  let empCache = []
  sb.from('profiles')
    .select('id,full_name,day_balance,is_active')
    .or('is_active.is.null,is_active.eq.true')
    .order('full_name')
    .then(({ data }) => { empCache = data || [] })

  // ── Utilidades ───────────────────────────────────────────────────────────────
  const todayStr = () => localDate()
  const pad = n => String(n).padStart(2, '0')

  function minsToStr(m) {
    m = Math.round(Math.max(0, m))
    const h = Math.floor(m / 60), min = m % 60
    return h > 0 ? `${h}h${min > 0 ? ` ${min}min` : ''}` : `${min}min`
  }
  // BUG-8: dateLabel eliminada (dead code — definida pero nunca llamada)

  // ── Extracción de entidades ──────────────────────────────────────────────────
  function extractEmployee(text) {
    // BUG-1 fix: comparación de palabras exactas (no substring) para evitar
    // falsos positivos como "Ana" dentro de "mañana" → normalize("mañana")="manana"
    const words = normalize(text).split(/\s+/)
    let best = null, bestScore = 0
    for (const e of empCache) {
      for (const part of normalize(e.full_name || '').split(' ')) {
        if (part.length > 2 && words.includes(part) && part.length > bestScore) {
          best = e; bestScore = part.length
        }
      }
    }
    return best
  }

  function normalize(s) {
    return s.toLowerCase()
      .replace(/[áä]/g, 'a').replace(/[éë]/g, 'e')
      .replace(/[íï]/g, 'i').replace(/[óö]/g, 'o')
      .replace(/[úü]/g, 'u').replace(/ñ/g, 'n')
  }

  function extractDateRange(text) {
    const t = normalize(text)
    const now = new Date()
    const td = todayStr()

    if (t.includes('hoy'))  return { from: td, to: td, label: 'hoy' }
    if (t.includes('ayer')) {
      const d = new Date(now); d.setDate(d.getDate() - 1)
      const s = localDate(d)
      return { from: s, to: s, label: 'ayer' }
    }
    if (t.includes('manana')) {
      const d = new Date(now); d.setDate(d.getDate() + 1)
      const s = localDate(d)
      return { from: s, to: s, label: 'mañana' }
    }
    if (/semana pasada|ultima semana/.test(t)) {
      const day = now.getDay() || 7
      const mon = new Date(now); mon.setDate(now.getDate() - day - 6)
      const sun = new Date(now); sun.setDate(now.getDate() - day)
      return { from: localDate(mon), to: localDate(sun), label: 'la semana pasada' }
    }
    // BUG-10 fix: manejar "próxima semana" antes de "esta semana"
    if (/proxima semana|semana que viene|semana siguiente/.test(t)) {
      const day = now.getDay() || 7
      const nextMon = new Date(now); nextMon.setDate(now.getDate() - day + 8)
      const nextSun = new Date(now); nextSun.setDate(now.getDate() - day + 14)
      return { from: localDate(nextMon), to: localDate(nextSun), label: 'la próxima semana' }
    }
    if (/esta semana|semana/.test(t)) {
      const day = now.getDay() || 7
      const mon = new Date(now); mon.setDate(now.getDate() - day + 1)
      return { from: localDate(mon), to: td, label: 'esta semana' }
    }
    if (/mes pasado|ultimo mes/.test(t)) {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const last = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from: localDate(d), to: localDate(last), label: 'el mes pasado' }
    }
    if (/este mes|mes/.test(t)) {
      const first = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`
      return { from: first, to: td, label: 'este mes' }
    }
    // Fecha específica: "3 de junio", "el 15 de marzo"
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
    for (let i = 0; i < meses.length; i++) {
      const re = new RegExp(`(\\d{1,2})\\s+de\\s+${meses[i]}`)
      const m = t.match(re)
      if (m) {
        const ds = `${now.getFullYear()}-${pad(i + 1)}-${pad(parseInt(m[1]))}`
        return { from: ds, to: ds, label: `el ${m[1]} de ${meses[i]}` }
      }
    }
    return { from: td, to: td, label: 'hoy' }
  }

  // ── Handlers de consulta ─────────────────────────────────────────────────────

  async function queryResumen() {
    const td = todayStr()
    const [{ data: scheds }, { data: clocks }, { count: dlP }, { count: heP }] = await Promise.all([
      sb.from('schedules')
        .select('employee_id,shift_start,shift_end,profiles!employee_id(full_name)')
        .eq('date', td).eq('day_type', 'turno'),
      sb.from('clock_records')
        .select('employee_id,clock_in,clock_out').eq('date', td),
      sb.from('time_off_requests').select('*', { count: 'exact', head: true }).eq('status', 'pendiente'),
      sb.from('overtime_records').select('*', { count: 'exact', head: true }).eq('status', 'pendiente')
    ])

    const clockMap = {}
    for (const c of clocks || []) clockMap[c.employee_id] = c

    const inside = [], gone = [], waiting = []
    for (const s of scheds || []) {
      const name = s.profiles?.full_name || '?'
      const turno = `${(s.shift_start || '').slice(0, 5)}–${(s.shift_end || '').slice(0, 5)}`
      const c = clockMap[s.employee_id]
      if (c?.clock_in && !c?.clock_out) inside.push(`  • ${name} (${turno})`)
      else if (c?.clock_out)            gone.push(`  • ${name}`)
      else                              waiting.push(`  • ${name} (${turno})`)
    }

    const today = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
    let msg = `📊 Resumen del equipo — ${today}\n`
    if (inside.length)   msg += `\n✅ Trabajando ahora (${inside.length}):\n${inside.join('\n')}`
    if (gone.length)     msg += `\n🏠 Ya salieron (${gone.length}):\n${gone.join('\n')}`
    if (waiting.length)  msg += `\n⏳ Sin marcar (${waiting.length}):\n${waiting.join('\n')}`
    if (!scheds?.length) msg += '\nNo hay turnos asignados para hoy.'
    if (dlP || heP)      msg += `\n\n🔔 Solicitudes pendientes: ${dlP || 0} días libres · ${heP || 0} HH.EE.`
    return msg
  }

  async function queryHoras(text) {
    const emp = extractEmployee(text)
    const { from, to, label } = extractDateRange(text)

    let q = sb.from('clock_records')
      .select('employee_id,clock_in,clock_out,date,profiles!employee_id(full_name)')
      .gte('date', from).lte('date', to).not('clock_out', 'is', null)
    if (emp) q = q.eq('employee_id', emp.id)
    const { data } = await q

    if (!data?.length)
      return emp
        ? `No encontré registros de asistencia de ${emp.full_name} para ${label}.`
        : `Sin registros de asistencia para ${label}.`

    const byEmp = {}
    for (const r of data) {
      const name = r.profiles?.full_name || r.employee_id
      if (!byEmp[name]) byEmp[name] = 0
      byEmp[name] += (new Date(r.clock_out) - new Date(r.clock_in)) / 60000
    }

    if (emp) {
      const mins = Object.values(byEmp)[0] || 0
      return `⏱ ${emp.full_name} trabajó **${minsToStr(mins)}** ${label}.`
    }
    const lines = Object.entries(byEmp)
      .sort((a, b) => b[1] - a[1])
      .map(([n, m]) => `  • ${n}: ${minsToStr(m)}`)
      .join('\n')
    return `⏱ Horas trabajadas ${label}:\n\n${lines}`
  }

  async function queryTardes(text) {
    const { from, to, label } = extractDateRange(text)
    const emp = extractEmployee(text)

    let sq = sb.from('schedules')
      .select('employee_id,date,shift_start,profiles!employee_id(full_name)')
      .gte('date', from).lte('date', to)
      .not('shift_start', 'is', null).eq('day_type', 'turno')
    if (emp) sq = sq.eq('employee_id', emp.id)
    const { data: scheds } = await sq
    if (!scheds?.length) return `No hay turnos registrados para ${label}.`

    const ids = [...new Set(scheds.map(s => s.employee_id))]
    const { data: recs } = await sb.from('clock_records')
      .select('employee_id,date,clock_in')
      .in('employee_id', ids).gte('date', from).lte('date', to)
      .not('clock_in', 'is', null)

    const clMap = {}
    for (const r of recs || []) clMap[`${r.employee_id}_${r.date}`] = r

    const late = []
    for (const s of scheds) {
      const r = clMap[`${s.employee_id}_${s.date}`]
      if (!r) continue
      const lateMin = Math.round(
        (new Date(r.clock_in) - new Date(`${s.date}T${s.shift_start.slice(0, 5)}:00`)) / 60000
      )
      if (lateMin > 15) late.push({ name: s.profiles?.full_name || '?', date: s.date, lateMin })
    }

    if (!late.length) return `✅ Sin llegadas tarde ${label}.`
    const lines = late
      .sort((a, b) => b.lateMin - a.lateMin)
      .map(r => `  • ${r.name}${from !== to ? ' (' + r.date + ')' : ''}: ${minsToStr(r.lateMin)} tarde`)
      .join('\n')
    return `⚠️ Llegadas tarde ${label}:\n\n${lines}`
  }

  async function queryTurnos(text) {
    const { from, to, label } = extractDateRange(text)
    const emp = extractEmployee(text)

    let q = sb.from('schedules')
      .select('employee_id,date,shift_start,shift_end,profiles!employee_id(full_name)')
      .gte('date', from).lte('date', to)
      .eq('day_type', 'turno')
      .order('date')                     // BUG-9 fix: primero por fecha
      .order('shift_start')
    if (emp) q = q.eq('employee_id', emp.id)
    const { data } = await q
    if (!data?.length)
      return emp
        ? `No hay turno de ${emp.full_name} para ${label}.`
        : `Sin turnos asignados para ${label}.`

    const { data: clocks } = await sb.from('clock_records')
      .select('employee_id,date,clock_in,clock_out').gte('date', from).lte('date', to)
    // BUG-2 fix: clave employee_id+date para evitar colisión en rangos multi-día
    const ckMap = {}
    for (const c of clocks || []) ckMap[`${c.employee_id}_${c.date}`] = c

    const lines = data.map(s => {
      const t = `${(s.shift_start || '').slice(0, 5)}–${(s.shift_end || '').slice(0, 5)}`
      const c = ckMap[`${s.employee_id}_${s.date}`]  // BUG-2 fix
      const st = c?.clock_in && !c?.clock_out ? ' ✅' : c?.clock_out ? ' 🏠' : ''
      const d = from !== to ? ` [${s.date}]` : ''
      return `  • ${s.profiles?.full_name || '?'}${d}: ${t}${st}`
    })
    return `📋 Turnos ${label}:\n\n${lines.join('\n')}`
  }

  async function queryAusencias(text) {
    const { from, to, label } = extractDateRange(text)
    const { data: scheds } = await sb.from('schedules')
      .select('employee_id,date,profiles!employee_id(full_name)')
      .gte('date', from).lte('date', to)
      .not('shift_start', 'is', null).eq('day_type', 'turno')
    if (!scheds?.length) return `No hay turnos para ${label}.`

    const ids = [...new Set(scheds.map(s => s.employee_id))]
    const { data: recs } = await sb.from('clock_records')
      .select('employee_id,date').in('employee_id', ids).gte('date', from).lte('date', to)

    const marked = new Set((recs || []).map(r => `${r.employee_id}_${r.date}`))
    const absent = scheds.filter(s => !marked.has(`${s.employee_id}_${s.date}`))
    if (!absent.length) return `✅ Todos marcaron ${label}.`

    const lines = absent.map(s =>
      `  • ${s.profiles?.full_name || '?'}${from !== to ? ' (' + s.date + ')' : ''}`
    )
    return `❌ Sin marcaje ${label} (${absent.length}):\n\n${lines.join('\n')}`
  }

  async function queryDiasLibres(text) {
    const emp = extractEmployee(text)

    // Saldo de turnos (day_balance): convención de toda la app —
    //   > 0 = el empleado DEBE días al hotel · < 0 = el hotel le debe al empleado
    const rotStr = (bal) => {
      if (!bal) return 'saldo de turnos a mano ✓'
      return bal > 0
        ? `debe ${bal} día(s) de turno al hotel`
        : `el hotel le debe ${Math.abs(bal)} día(s) de turno`
    }

    if (emp) {
      // Días compensatorios = misma fórmula que dashboard/mi-perfil/solicitudes
      const comp  = await getCompensatoryBalance(emp.id)
      const fresh = empCache.find(e => e.id === emp.id)
      const bal   = fresh?.day_balance || 0
      return `🗓 **${emp.full_name}**\n` +
        `  • Días compensatorios disponibles: **${Math.max(0, comp.available)}** ` +
        `(${comp.earned} ganados · ${comp.used} usados)\n` +
        `  • Saldo de turnos: ${rotStr(bal)}`
    }

    // Equipo: calcular compensatorios en paralelo (uno por empleado)
    const rows = await Promise.all(
      empCache.map(async e => ({
        name: e.full_name,
        comp: (await getCompensatoryBalance(e.id)).available,
        rot:  e.day_balance || 0
      }))
    )
    const lines = rows
      .sort((a, b) => b.comp - a.comp)
      .map(e => {
        const c = Math.max(0, e.comp)
        const r = e.rot ? ` · ${e.rot > 0 ? 'debe ' + e.rot : 'a favor ' + Math.abs(e.rot)}d turnos` : ''
        return `  • ${e.name}: ${c} compensatorio(s)${r}`
      })
      .join('\n')
    return `🗓 Saldo del equipo (compensatorios + turnos):\n\n${lines || 'Sin datos'}`
  }

  async function querySolicitudes() {
    const [{ data: dl }, { data: he }] = await Promise.all([
      sb.from('time_off_requests')
        .select('start_date,end_date,type,profiles!employee_id(full_name)')
        .eq('status', 'pendiente').order('start_date'),
      sb.from('overtime_records')
        .select('date,hours,profiles!employee_id(full_name)')
        .eq('status', 'pendiente').order('date')
    ])
    if (!dl?.length && !he?.length) return '✅ No hay solicitudes pendientes.'

    let msg = ''
    if (dl?.length) {
      msg += `📅 Días libres pendientes (${dl.length}):\n`
      msg += dl.map(r =>
        `  • ${r.profiles?.full_name} — ${r.start_date}` +
        `${r.end_date !== r.start_date ? ' → ' + r.end_date : ''} (${typeLabel(r.type)})`
      ).join('\n')
    }
    if (he?.length) {
      if (msg) msg += '\n\n'
      msg += `⏰ HH.EE. pendientes (${he.length}):\n`
      msg += he.map(r => `  • ${r.profiles?.full_name} — ${r.date} · ${r.hours}h`).join('\n')
    }
    return msg
  }

  async function queryEmpleados(text) {
    const t = normalize(text)
    if (/cuantos|total|cantidad/.test(t))
      return `👥 Hay **${empCache.length} empleados activos** en el sistema.`
    const lines = empCache.map(e => `  • ${e.full_name}`).join('\n')
    return `👥 Equipo activo (${empCache.length}):\n\n${lines}`
  }

  // ── Dispatcher ───────────────────────────────────────────────────────────────
  async function dispatch(text) {
    const t = normalize(text)

    if (/resumen|status hoy|estado hoy|equipo hoy|como esta el equipo/.test(t))
      return queryResumen()

    // BUG-7 fix: "hora extra" eliminado para no capturar "¿cuántas horas extra hizo Juan?"
    // Ahora ese caso cae correctamente en queryHoras (que también muestra HH.EE. trabajadas)
    if (/solicitud|pendiente|aprobar|hh\.?ee/.test(t))
      return querySolicitudes()

    if (/ausent|no marc|falt|no vino|no trabajo|no asistio/.test(t))
      return queryAusencias(text)

    if (/tard[eo]|tardanza|retraso|llego tarde|llegaron tarde/.test(t))
      return queryTardes(text)

    if (/hora|trabajo|marco|asistencia|jornada|tiempo trabaj/.test(t))
      return queryHoras(text)

    if (/dia.? libre|vacacion|compensator|saldo|balance|descanso libre/.test(t))
      return queryDiasLibres(text)

    if (/turno|horario|quien trabaja|quienes trabajan|trabaja (hoy|manana|esta)|quien esta/.test(t))
      return queryTurnos(text)

    if (/empleado|personal|equipo|staff|quien.?es son|cuantos son/.test(t))
      return queryEmpleados(text)

    return `No entendí bien 🤔 Puedo consultar:\n\n  • Horas trabajadas (hoy / esta semana / este mes)\n  • Llegadas tarde\n  • Turnos del día\n  • Solicitudes pendientes\n  • Saldo compensatorio\n  • Ausencias / sin marcaje\n  • Resumen general del equipo\n\nMenciona un nombre para filtrar por empleado.`
  }

  // ── Chat loop ────────────────────────────────────────────────────────────────
  const msgsEl  = document.getElementById('hrChatMsgs')
  const inputEl = document.getElementById('hrChatInput')
  const sendBtn = document.getElementById('hrChatSend')

  function addMsg(role, html, loading = false) {
    const div = document.createElement('div')
    div.className = `hrc-msg ${role}${loading ? ' loading' : ''}`
    // Escapar HTML, luego aplicar **bold**, saltos de línea
    div.innerHTML = html
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>')
    msgsEl.appendChild(div)
    msgsEl.scrollTop = msgsEl.scrollHeight
    return div
  }

  async function send() {
    const q = inputEl.value.trim()
    if (!q) return
    inputEl.value = ''
    sendBtn.disabled = true
    addMsg('user', q)
    const loader = addMsg('bot', '• • •', true)
    try {
      const answer = await dispatch(q)
      loader.remove()
      addMsg('bot', answer)
    } catch (err) {
      loader.remove()
      addMsg('bot', 'Error al consultar datos. Intenta de nuevo.')
      console.error('[HR Chat]', err)
    } finally {
      sendBtn.disabled = false
      inputEl.focus()
    }
  }

  sendBtn.onclick = send
  inputEl.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) send() })
}
