export const onlyDigits = (s = '') => String(s).replace(/\D/g, '')

export function maskCPF(v) {
  const d = onlyDigits(v).slice(0, 11)
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

export function formatCPF(v) {
  const d = onlyDigits(v)
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : v
}

export function maskWhats(v) {
  const d = onlyDigits(v).slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function validarCPF(cpf) {
  const c = onlyDigits(cpf)
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false
  const digito = (len) => {
    let soma = 0
    for (let i = 0; i < len; i++) soma += Number(c[i]) * (len + 1 - i)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  return digito(9) === Number(c[9]) && digito(10) === Number(c[10])
}

// 'YYYY-MM-DD' -> 'DD/MM/AAAA' sem sofrer com fuso horário
export function dateBR(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export const hojeISO = () => new Date().toLocaleDateString('sv-SE')

export function ontemISO() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toLocaleDateString('sv-SE')
}

export const moeda = (n) =>
  Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
