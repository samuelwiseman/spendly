import { getMe, getEntries, deleteEntry } from './api.js'
import { initModal, openModal } from './modal.js'

let currentEntries = []
let activeFilter = 'all'

function fmt(n) {
  const s = n.toFixed(2)
  return `£${s.endsWith('.00') ? s.slice(0, -3) : s}`
}

function getMonth() {
  return new URLSearchParams(location.search).get('month')
    || new Date().toISOString().slice(0, 7)
}

function setMonth(month) {
  const url = new URL(location.href)
  url.searchParams.set('month', month)
  history.pushState({}, '', url)
  load()
}

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function fmtMonthLabel(month) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

function fmtDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function renderEntries() {
  const list = document.getElementById('entries-list')
  const filtered = activeFilter === 'all'
    ? currentEntries
    : currentEntries.filter(e => e.category === activeFilter)

  if (filtered.length === 0) {
    list.innerHTML = '<p class="empty-state">No entries for this period.</p>'
    return
  }

  list.innerHTML = filtered.map(e => {
    const label = e.category.charAt(0).toUpperCase() + e.category.slice(1)
    const meta = [
      fmtDate(e.date),
      label,
      e.recurring ? 'Recurring' : null,
      e.payment_method || null
    ].filter(Boolean).join(' · ')

    return `
      <div class="entry-row entry-row--${e.category}">
        <div class="entry-info">
          <div class="entry-name">${e.name}</div>
          <div class="entry-meta">${meta}</div>
        </div>
        <div class="entry-right">
          <div class="entry-amount entry-amount--${e.category}">${fmt(e.amount)}</div>
          <div class="entry-actions">
            <button class="btn-icon edit-btn" data-id="${e.id}" aria-label="Edit ${e.name}">✏</button>
            <button class="btn-icon delete-btn" data-id="${e.id}" aria-label="Delete ${e.name}">✕</button>
          </div>
        </div>
      </div>
    `
  }).join('')

  list.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const entry = currentEntries.find(e => e.id === parseInt(btn.dataset.id))
      openModal(entry)
    })
  })

  list.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this entry?')) return
      try {
        await deleteEntry(parseInt(btn.dataset.id))
        await load()
      } catch {
        alert('Failed to delete. Please try again.')
      }
    })
  })
}

async function load() {
  const month = getMonth()
  document.getElementById('month-label').textContent = fmtMonthLabel(month)
  currentEntries = await getEntries(month)
  renderEntries()
}

async function init() {
  const user = await getMe()
  if (!user) { location.href = '/login.html'; return }

  document.getElementById('user-avatar').src = user.avatarUrl || ''
  document.getElementById('logout-btn').addEventListener('click', () => { location.href = '/auth/logout' })
  document.getElementById('prev-month').addEventListener('click', () => setMonth(shiftMonth(getMonth(), -1)))
  document.getElementById('next-month').addEventListener('click', () => setMonth(shiftMonth(getMonth(), 1)))
  document.getElementById('add-entry-btn').addEventListener('click', () => openModal())

  document.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.pill').forEach(p => p.classList.remove('pill--active'))
      pill.classList.add('pill--active')
      activeFilter = pill.dataset.filter
      renderEntries()
    })
  })

  initModal(load)
  await load()
}

init()
