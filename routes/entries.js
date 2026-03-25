export default async function entriesRoutes(app) {
  // Auth guard for all /api/* routes
  app.addHook('preHandler', async (request, reply) => {
    if (!request.session.userId) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }
  })

  app.get('/entries', async (request, reply) => {
    const { month } = request.query
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return reply.status(400).send({ error: 'month query param required (format: YYYY-MM)' })
    }
    return app.db.getEntriesByMonth(request.session.userId, month)
  })

  app.post('/entries', async (request, reply) => {
    const { name, amount, category, date, notes, recurring, payment_method } = request.body ?? {}
    if (!name || amount == null || !category || !date) {
      return reply.status(400).send({ error: 'name, amount, category and date are required' })
    }
    const entry = app.db.createEntry(request.session.userId, {
      name, amount, category, date, notes, recurring, payment_method
    })
    return reply.status(201).send(entry)
  })

  app.put('/entries/:id', async (request, reply) => {
    const { name, amount, category, date, notes, recurring, payment_method } = request.body ?? {}
    if (!name || amount == null || !category || !date) {
      return reply.status(400).send({ error: 'name, amount, category and date are required' })
    }
    const entry = app.db.updateEntry(
      request.session.userId,
      parseInt(request.params.id),
      { name, amount, category, date, notes, recurring, payment_method }
    )
    if (!entry) return reply.status(404).send({ error: 'Entry not found' })
    return entry
  })

  app.delete('/entries/:id', async (request, reply) => {
    const deleted = app.db.deleteEntry(
      request.session.userId,
      parseInt(request.params.id)
    )
    if (!deleted) return reply.status(404).send({ error: 'Entry not found' })
    return reply.status(204).send()
  })
}
