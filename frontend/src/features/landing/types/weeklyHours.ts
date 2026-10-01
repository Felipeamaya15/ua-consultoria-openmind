const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// Presentación del horario persistido. El texto antiguo se conserva sin inferir días.
export function weeklyHours(value: string) {
  if (!value.trim()) return null;
  const parts = value.split(/;\s*|\n/).filter(part => part.trim());
  const rows = parts.map(part => /^(Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo):\s*(?:(\d{2}:\d{2})\s*[–-]\s*(\d{2}:\d{2})|(Cerrado))$/i.exec(part.trim()));
  if (rows.some(row => !row) || new Set(rows.map(row => row![1].toLowerCase())).size !== rows.length) return null;
  return days.map(day => {
    const row = rows.find(row => row![1].toLowerCase() === day.toLowerCase());
    return { day, hours: row?.[2] ? `${row[2]} – ${row[3]}` : 'Cerrado', overnight: !!row?.[2] && row[3] < row[2] };
  });
}
