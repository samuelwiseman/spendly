import { getMe, getEntries } from './api.js'
import { initModal, openModal } from './modal.js'

const COLORS = { need: '#16a34a', want: '#d97706', luxury: '#7c3aed' }

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

async function load() {
  const month = getMonth()
  document.getElementById('month-label').textContent = fmtMonthLabel(month)

  const entries = await getEntries(month)
  const totals = { need: 0, want: 0, luxury: 0 }
  const counts = { need: 0, want: 0, luxury: 0 }

  for (const e of entries) {
    totals[e.category] += e.amount
    counts[e.category]++
  }

  const total = totals.need + totals.want + totals.luxury
  const donut = document.getElementById('donut')

  if (total === 0) {
    donut.style.background = '#e5e5e5'
  } else {
    const n = (totals.need / total) * 100
    const w = (totals.want / total) * 100
    donut.style.background = `conic-gradient(
      ${COLORS.need} 0% ${n}%,
      ${COLORS.want} ${n}% ${n + w}%,
      ${COLORS.luxury} ${n + w}% 100%
    )`
  }

  document.getElementById('total-amount').textContent = fmt(total)
  document.getElementById('legend-need').textContent = `Need ${fmt(totals.need)}`
  document.getElementById('legend-want').textContent = `Want ${fmt(totals.want)}`
  document.getElementById('legend-luxury').textContent = `Luxury ${fmt(totals.luxury)}`

  const breakdown = document.getElementById('category-breakdown')
  breakdown.innerHTML = ['need', 'want', 'luxury'].map(cat => {
    const pct = total ? Math.round((totals[cat] / total) * 100) : 0
    const label = cat.charAt(0).toUpperCase() + cat.slice(1)
    const n = counts[cat]
    return `
      <div class="breakdown-row breakdown-row--${cat}">
        <div class="breakdown-left">
          <span class="breakdown-dot breakdown-dot--${cat}"></span>
          <div>
            <div class="breakdown-name">${label}</div>
            <div class="breakdown-count">${n} entr${n === 1 ? 'y' : 'ies'}</div>
          </div>
        </div>
        <div class="breakdown-right">
          <div class="breakdown-amount breakdown-amount--${cat}">${fmt(totals[cat])}</div>
          <div class="breakdown-pct">${pct}%</div>
        </div>
      </div>
    `
  }).join('')
}

async function init() {
  const user = await getMe()
  if (!user) { location.href = '/login.html'; return }

  document.getElementById('user-avatar').src = user.avatarUrl || ''
  document.getElementById('logout-btn').addEventListener('click', () => { location.href = '/auth/logout' })
  document.getElementById('prev-month').addEventListener('click', () => setMonth(shiftMonth(getMonth(), -1)))
  document.getElementById('next-month').addEventListener('click', () => setMonth(shiftMonth(getMonth(), 1)))
  document.getElementById('add-entry-btn').addEventListener('click', () => openModal())

  initModal(load)
  await load()
}

init()
