import { createEntry, updateEntry } from './api.js'

const PAYMENT_METHODS = ['Card', 'Bank transfer', 'Cash', 'Direct debit', 'Other']
const CATEGORIES = [
  { value: 'need', label: 'Need' },
  { value: 'want', label: 'Want' },
  { value: 'luxury', label: 'Luxury' }
]

let onSave = null
let editId = null

function $(id) { return document.getElementById(id) }

function buildModalHTML() {
  return `
    <div class="modal-backdrop" id="modal-backdrop"></div>
    <aside class="modal-panel" id="modal-panel" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-header">
        <h2 class="modal-title" id="modal-title">Add Entry</h2>
        <button class="btn-ghost modal-close" id="modal-close" aria-label="Close">&times;</button>
      </div>
      <form id="entry-form" class="modal-form" novalidate>
        <div class="form-group">
          <label for="field-name">Name *</label>
          <input id="field-name" name="name" type="text" class="form-input" required placeholder="e.g. Rent, Spotify">
        </div>
        <div class="form-group">
          <label for="field-amount">Amount (£) *</label>
          <input id="field-amount" name="amount" type="number" min="0.01" step="0.01" class="form-input" required placeholder="0.00">
        </div>
        <div class="form-group">
          <label for="field-category">Category *</label>
          <select id="field-category" name="category" class="form-input" required>
            <option value="">Select...</option>
            ${CATEGORIES.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="field-date">Date *</label>
          <input id="field-date" name="date" type="date" class="form-input" required>
        </div>
        <div class="form-group">
          <label for="field-payment">Payment Method</label>
          <select id="field-payment" name="payment_method" class="form-input">
            <option value="">Select...</option>
            ${PAYMENT_METHODS.map(m => `<option value="${m}">${m}</option>`).join('')}
          </select>
        </div>
        <div class="form-group form-group--inline">
          <label for="field-recurring">Recurring monthly</label>
          <input id="field-recurring" name="recurring" type="checkbox">
        </div>
        <div class="form-group">
          <label for="field-notes">Notes</label>
          <textarea id="field-notes" name="notes" class="form-input" rows="3" placeholder="Optional notes..."></textarea>
        </div>
        <div id="form-error" class="form-error" hidden></div>
        <button type="submit" class="btn btn-primary btn-full" id="submit-btn">Save Entry</button>
      </form>
    </aside>
  `
}

export function initModal(saveCallback) {
  onSave = saveCallback
  const wrapper = document.createElement('div')
  wrapper.innerHTML = buildModalHTML()
  document.body.appendChild(wrapper)

  $('modal-close').addEventListener('click', closeModal)
  $('modal-backdrop').addEventListener('click', closeModal)
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal() })
  $('entry-form').addEventListener('submit', handleSubmit)
}

export function openModal(entry = null) {
  editId = entry?.id ?? null
  $('modal-title').textContent = entry ? 'Edit Entry' : 'Add Entry'
  $('submit-btn').textContent = entry ? 'Save Changes' : 'Save Entry'

  $('entry-form').reset()
  $('form-error').hidden = true

  if (entry) {
    $('field-name').value = entry.name
    $('field-amount').value = entry.amount
    $('field-category').value = entry.category
    $('field-date').value = entry.date
    $('field-payment').value = entry.payment_method || ''
    $('field-recurring').checked = Boolean(entry.recurring)
    $('field-notes').value = entry.notes || ''
  } else {
    $('field-date').value = new Date().toISOString().split('T')[0]
  }

  $('modal-backdrop').classList.add('modal-backdrop--visible')
  $('modal-panel').classList.add('modal-panel--open')
  $('field-name').focus()
}

export function closeModal() {
  $('modal-backdrop').classList.remove('modal-backdrop--visible')
  $('modal-panel').classList.remove('modal-panel--open')
  editId = null
}

async function handleSubmit(e) {
  e.preventDefault()
  const form = e.target
  const errorEl = $('form-error')
  const submitBtn = $('submit-btn')
  const isEdit = editId !== null

  const data = {
    name: form.elements['name'].value.trim(),
    amount: parseFloat(form.amount.value),
    category: form.category.value,
    date: form.date.value,
    payment_method: form.payment_method.value || null,
    recurring: form.recurring.checked ? 1 : 0,
    notes: form.notes.value.trim() || null
  }

  if (!data.name || !data.amount || !data.category || !data.date) {
    errorEl.textContent = 'Name, amount, category and date are required.'
    errorEl.hidden = false
    return
  }

  submitBtn.disabled = true
  submitBtn.textContent = 'Saving...'
  errorEl.hidden = true

  try {
    if (isEdit) {
      await updateEntry(editId, data)
    } else {
      await createEntry(data)
    }
    closeModal()
    onSave?.()
  } catch {
    errorEl.textContent = 'Failed to save. Please try again.'
    errorEl.hidden = false
  } finally {
    submitBtn.disabled = false
    submitBtn.textContent = isEdit ? 'Save Changes' : 'Save Entry'
  }
}
