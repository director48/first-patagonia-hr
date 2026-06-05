const SUPABASE_URL = 'https://eleammvldfnhoavjslyh.supabase.co'
const SUPABASE_KEY = 'sb_publishable_YzllULRbT67-OpXqXhWOWA_pOBVgeU8'
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY)

// Fecha local (YYYY-MM-DD) según la hora del navegador (Chile), NO UTC.
// Evita el bug de que después de las ~20:00 toISOString() salte al día siguiente.
function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
