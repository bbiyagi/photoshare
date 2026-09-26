// '2025-03-14' → '2025. 3. 14.'
export function formatDate(date: string) {
  const [y, m, d] = date.split('-')
  return `${y}. ${Number(m)}. ${Number(d)}.`
}

// '2025-03-14' → '25.03.14.' (추억 카드·목록용 짧은 표기)
export function formatShortDate(date: string) {
  const [y, m, d] = date.split('-')
  return `${y!.slice(2)}.${m}.${d}.`
}
