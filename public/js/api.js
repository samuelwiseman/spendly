export async function getMe() {
  const res = await fetch('/auth/me')
  if (!res.ok) return null
  return res.json()
}

export async function getEntries(month) {
  const res = await fetch(`/api/entries?month=${month}`)
  if (!res.ok) throw new Error('Failed to fetch entries')
  return res.json()
}

export async function createEntry(data) {
  const res = await fetch('/api/entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  if (!res.ok) throw new Error('Failed to create entry')
  return res.json()
}

export async function updateEntry(id, data) {
  const res = await fetch(`/api/entries/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  if (!res.ok) throw new Error('Failed to update entry')
  return res.json()
}

export async function deleteEntry(id) {
  const res = await fetch(`/api/entries/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete entry')
}
