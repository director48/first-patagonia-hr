// ── Auth helpers ───────────────────────────────────────────────

async function requireAuth() {
  try {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 6000)
    )
    const { data: { user } } = await Promise.race([sb.auth.getUser(), timeout])
    if (!user) { window.location.href = 'login.html'; return null }
    return user
  } catch {
    window.location.href = 'login.html'
    return null
  }
}

async function getProfile(userId) {
  const { data } = await sb.from('profiles').select('*').eq('id', userId).single()
  return data
}

async function initPage() {
  const user = await requireAuth()
  if (!user) return null
  const profile = await getProfile(user.id)
  if (!profile) { await sb.auth.signOut(); window.location.href = 'login.html'; return null }
  renderSidebar(profile)
  if (profile.role === 'admin') loadAdminBadge()
  return { user, profile }
}

// ── Notificación WhatsApp al admin (fire-and-forget, nunca bloquea) ──
function notifyAdmin(msg) {
  try {
    fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey':        SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      },
      body: JSON.stringify({ message: msg })
    }).catch(() => {})
  } catch (_) {}
}

async function loadAdminBadge() {
  const [{ count: dl }, { count: he }, { count: rev }] = await Promise.all([
    sb.from('time_off_requests').select('*', { count: 'exact', head: true }).eq('status', 'pendiente'),
    sb.from('overtime_records').select('*', { count: 'exact', head: true }).eq('status', 'pendiente'),
    sb.from('clock_records').select('*', { count: 'exact', head: true }).eq('needs_review', true).not('clock_out','is',null)
  ])
  const total = (dl ?? 0) + (he ?? 0) + (rev ?? 0)
  const badge = document.getElementById('navBadgeSolicitudes')
  if (!badge) return
  badge.textContent = total > 99 ? '99+' : String(total)
  badge.style.display = total > 0 ? 'inline' : 'none'
}

async function signOut() {
  await sb.auth.signOut()
  window.location.href = 'login.html'
}

// ── Sidebar renderer ───────────────────────────────────────────

function renderSidebar(profile) {
  const sidebar = document.getElementById('sidebar')
  if (!sidebar) return

  const isAdmin = profile.role === 'admin'
  const initials = (profile.full_name || '').split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase() || '?'
  const page = window.location.pathname.split('/').pop() || 'dashboard.html'

  const adminLinks = [
    { section: 'General' },
    { href: 'dashboard.html',     icon: iconSvg('layout-dashboard'), label: 'Dashboard' },
    { section: 'Equipo' },
    { href: 'horarios.html',      icon: iconSvg('calendar-range'),   label: 'Turnos del equipo' },
    { href: 'solicitudes.html',   icon: iconSvg('clipboard-list'),   label: 'Solicitudes', badge: true },
    { href: 'pagos.html',         icon: iconSvg('credit-card'),      label: 'Pagos' },
    { href: 'empleados.html',     icon: iconSvg('users'),            label: 'Empleados' },
    { section: 'Ayuda' },
    { href: 'guia.html',          icon: iconSvg('book-open'),        label: 'Guía de uso' },
  ]

  const empLinks = [
    { section: 'Mi espacio' },
    { href: 'mi-perfil.html',     icon: iconSvg('user'),             label: 'Mi Perfil' },
    { href: 'horarios.html',      icon: iconSvg('calendar-days'),    label: 'Mis Horarios' },
    { href: 'dias-libres.html',   icon: iconSvg('umbrella'),         label: 'Permisos' },
    { href: 'horas-extras.html',  icon: iconSvg('clock'),            label: 'Horas Extras' },
    { href: 'pagos.html',         icon: iconSvg('credit-card'),      label: 'Mis Pagos' },
    { section: 'Ayuda' },
    { href: 'guia.html',          icon: iconSvg('book-open'),        label: 'Guía de uso' },
  ]

  const links = isAdmin ? adminLinks : empLinks

  sidebar.innerHTML = `
    <div class="sidebar-logo">
      <h1>First Patagonia</h1>
      <span>${isAdmin ? 'Administrador' : 'Panel Personal'}</span>
    </div>
    <nav class="sidebar-nav">
      ${links.map(l => l.section
        ? `<div class="nav-label">${l.section}</div>`
        : `<a href="${l.href}" class="nav-link${page === l.href ? ' active' : ''}">
            ${l.icon} ${l.label}
            ${l.badge ? `<span id="navBadgeSolicitudes" style="display:none;margin-left:auto;background:#dc2626;color:white;border-radius:999px;padding:.05rem .42rem;font-size:.62rem;font-weight:700;min-width:16px;text-align:center;line-height:1.5"></span>` : ''}
           </a>`
      ).join('')}

    </nav>
    <div class="sidebar-footer">
      <div class="sidebar-user">
        <div class="sidebar-avatar">${initials}</div>
        <div class="sidebar-user-info">
          <div class="sidebar-user-name">${profile.full_name}</div>
          <div class="sidebar-user-role">${isAdmin ? 'Administrador' : 'Empleado'}</div>
        </div>
        <button class="sidebar-logout" onclick="signOut()" title="Cerrar sesión">
          ${iconSvg('log-out', 16)}
        </button>
      </div>
    </div>
  `

  const toggle = document.getElementById('menuToggle')
  const overlay = document.getElementById('sidebarOverlay')
  if (toggle && overlay) {
    toggle.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('open') })
    overlay.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('open') })
  }
}

// ── Inline SVG icons (Lucide subset) ──────────────────────────

function iconSvg(name, size = 17) {
  const icons = {
    'layout-dashboard': '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
    'calendar-days': '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><rect x="8" y="14" width="2" height="2"/><rect x="13" y="14" width="2" height="2"/>',
    'umbrella': '<path d="M23 12a11.05 11.05 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7"/>',
    'clock': '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    'users': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    'menu': '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
    'x': '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    'calendar': '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    'inbox': '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    'check': '<polyline points="20 6 9 17 4 12"/>',
    'alert-circle': '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    'user-plus': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>',
    'edit': '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    'chevron-left': '<polyline points="15 18 9 12 15 6"/>',
    'chevron-right': '<polyline points="9 18 15 12 9 6"/>',
    'credit-card': '<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
    'clipboard-list': '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/>',
    'calendar-range': '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h2v4H8z"/><path d="M14 14h2v2h-2z"/>',
    'user': '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    'download': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    'plus': '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    'book-open': '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  }
  const paths = icons[name] || ''
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
}

// ── Utilities ─────────────────────────────────────────────────

function showToast(msg, type = '') {
  let c = document.getElementById('toast-container')
  if (!c) { c = document.createElement('div'); c.id = 'toast-container'; document.body.appendChild(c) }
  const t = document.createElement('div')
  t.className = `toast${type ? ' toast--' + type : ''}`
  t.textContent = msg
  c.appendChild(t)
  setTimeout(() => t.remove(), 3500)
}

function formatDate(str) {
  if (!str) return '—'
  return new Date(str + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatTime(isoStr) {
  if (!isoStr) return '—'
  return new Date(isoStr).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

function statusBadge(status) {
  const l = { pendiente: 'Pendiente', aprobado: 'Aprobado', rechazado: 'Rechazado' }
  return `<span class="badge badge--${status}">${l[status] || status}</span>`
}

function typeLabel(type) {
  return {
    permiso_medico:       'Permiso médico',
    permiso_personal:     'Permiso personal',
    compensatorio:        'Día compensatorio',
    // Legado (registros anteriores)
    vacaciones:           'Vacaciones',
    licencia_medica:      'Lic. Médica',
    permiso_administrativo: 'Permiso Admin.',
    otro:                 'Otro'
  }[type] || type
}

function today() {
  return new Date().toISOString().split('T')[0]
}

// ── Reglas de fichaje ─────────────────────────────────────────
// Un registro es válido para contar horas si:
//   - tiene clock_out, O
//   - es de hoy (salida aún no registrada, jornada activa)
// Si es de un día anterior sin clock_out → "sin salida registrada", 0 horas

function clockStatus(record) {
  if (!record || !record.clock_in) return 'empty'
  if (record.clock_out) return 'complete'
  if (record.date === today()) return 'active'   // jornada en curso hoy
  return 'missing_exit'                           // olvidó marcar salida
}

function calcWorkedMinutes(record, scheduledMinutes = null) {
  if (!record || !record.clock_in || !record.clock_out) return 0
  const actual = (new Date(record.clock_out) - new Date(record.clock_in)) / 60000

  if (scheduledMinutes === null) return actual  // sin turno asignado: contar exacto

  // Regla del hotel:
  // · Si salió antes → contar horas reales (actual < scheduled)
  // · Si llegó a tiempo o se quedó extra → contar solo hasta el fin del turno
  // Los minutos extra NUNCA se suman automáticamente (se registran aparte en HH.EE.)
  return Math.min(actual, scheduledMinutes)
}

function workedLabel(record) {
  const status = clockStatus(record)
  if (status === 'empty') return '<span class="text-muted">—</span>'
  if (status === 'missing_exit') return '<span style="color:var(--red);font-size:.75rem">⚠ Sin salida</span>'
  if (status === 'active') return '<span style="color:var(--teal);font-size:.78rem">En curso</span>'
  const mins = calcWorkedMinutes(record)
  return `${Math.floor(mins/60)}h ${Math.round(mins%60)}m`
}

// Días compensatorios disponibles de un empleado
// earned  = floor(total_horas_HH.EE._aprobadas / 8)
// used    = suma de días de permisos compensatorios aprobados
// available = earned − used
async function getCompensatoryBalance(employeeId) {
  const [{ data: ot }, { data: comp }] = await Promise.all([
    sb.from('overtime_records')
      .select('hours')
      .eq('employee_id', employeeId)
      .eq('status', 'aprobado'),
    sb.from('time_off_requests')
      .select('start_date, end_date')
      .eq('employee_id', employeeId)
      .eq('type', 'compensatorio')
      .eq('status', 'aprobado')
  ])
  const earned = Math.floor(
    (ot || []).reduce((s, r) => s + Number(r.hours), 0) / 8
  )
  const used = (comp || []).reduce((sum, r) => {
    return sum + Math.max(1,
      Math.round((new Date(r.end_date + 'T12:00:00') - new Date(r.start_date + 'T12:00:00')) / 86400000) + 1
    )
  }, 0)
  return { earned, used, available: earned - used }
}

function getWeekDates(baseDate) {
  const d = new Date(baseDate + 'T12:00:00')
  const day = d.getDay()
  const monday = new Date(d)
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(monday)
    dt.setDate(monday.getDate() + i)
    return dt.toISOString().split('T')[0]
  })
}
