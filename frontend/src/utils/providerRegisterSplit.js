/**
 * Una sola caja "nombre completo" en registro proveedor → API sigue recibiendo nombre + apellido.
 */
export function splitNombreCompletoProveedor(raw) {
  const t = String(raw || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!t) return { nombre: '', apellido: '' };
  const parts = t.split(' ');
  if (parts.length === 1) return { nombre: parts[0], apellido: '' };
  return { nombre: parts[0], apellido: parts.slice(1).join(' ') };
}
