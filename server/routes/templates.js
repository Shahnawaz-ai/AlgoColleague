const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { dbGet, dbAll, dbRun, logActivity } = require('../db');

// List all templates
router.get('/', async (req, res) => {
  const { category } = req.query;
  let query = 'SELECT * FROM templates';
  const params = [];

  if (category) {
    query += ' WHERE category = ?';
    params.push(category);
  }

  query += ' ORDER BY usage_count DESC, created_at DESC';

  const templates = await dbGet(query).all(...params);
  const parsed = templates.map(t => ({ ...t, tags: JSON.parse(t.tags || '[]') }));

  res.json({ templates: parsed });
});

// Get single template
router.get('/:id', async (req, res) => {
  const template = await dbRun('SELECT * FROM templates WHERE id = ?', req.params.id);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  template.tags = JSON.parse(template.tags || '[]');
  res.json({ template });
});

// Create template
router.post('/', async (req, res) => {
  const { name, category = 'general', content, tags = [] } = req.body;
  if (!name || !content) {
    return res.status(400).json({ error: 'Name and content are required' });
  }

  const id = uuidv4();
  await dbGet(`
    INSERT INTO templates (id, name, category, content, tags, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `, id, name, category, content, JSON.stringify(tags));

  logActivity('template_created', 'template', id, `Created template: ${name}`);

  const template = await dbRun('SELECT * FROM templates WHERE id = ?', id);
  template.tags = JSON.parse(template.tags || '[]');

  res.status(201).json({ template });
});

// Update template
router.put('/:id', async (req, res) => {
  const template = await dbGet('SELECT * FROM templates WHERE id = ?', req.params.id);
  if (!template) return res.status(404).json({ error: 'Template not found' });

  const { name, category, content, tags } = req.body;
  const updates = [];
  const params = [];

  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (category !== undefined) { updates.push('category = ?'); params.push(category); }
  if (content !== undefined) { updates.push('content = ?'); params.push(content); }
  if (tags !== undefined) { updates.push('tags = ?'); params.push(JSON.stringify(tags)); }

  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(req.params.id);

  await dbGet(`UPDATE templates SET ${updates.join(', ')} WHERE id = ?`, ...params);
  logActivity('template_updated', 'template', req.params.id, 'Template updated');

  const updated = await dbRun('SELECT * FROM templates WHERE id = ?', req.params.id);
  updated.tags = JSON.parse(updated.tags || '[]');

  res.json({ template: updated });
});

// Delete template
router.delete('/:id', async (req, res) => {
  const template = await dbGet('SELECT * FROM templates WHERE id = ?', req.params.id);
  if (!template) return res.status(404).json({ error: 'Template not found' });

  await dbGet('DELETE FROM templates WHERE id = ?', req.params.id);
  logActivity('template_deleted', 'template', req.params.id, 'Template deleted');

  res.json({ success: true });
});

// Use template
router.post('/:id/use', async (req, res) => {
  const template = prepare('SELECT * FROM templates WHERE id = ?', req.params.id);
  if (!template) return res.status(404).json({ error: 'Template not found' });

  await dbGet('UPDATE templates SET usage_count = usage_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(req.params.id);

  template.tags = JSON.parse(template.tags || '[]');
  template.usage_count += 1;

  res.json({ template });
});

// Seed default templates
router.post('/seed', async (req, res) => {
  const existing = prepare('SELECT COUNT(*) as count FROM templates').count;
  if (existing > 0) {
    return res.json({ message: 'Templates already exist', seeded: 0 });
  }

  const defaults = [
    { name: 'Engagement Hook', category: 'engagement', content: '🔥 Hot take:\n\n[Your controversial opinion here]\n\nAgree or disagree? Drop your thoughts below 👇\n\n#LinkedIn #Engagement #Thoughts' },
    { name: 'Value Thread', category: 'thought_leadership', content: '📌 [X] things I learned about [topic] after [Y] years:\n\n1️⃣ \n2️⃣ \n3️⃣ \n4️⃣ \n5️⃣ \n\nWhich one resonates most? Let me know!\n\n#Leadership #Learning #Growth' },
    { name: 'Story Post', category: 'storytelling', content: 'Last week, something happened that changed how I think about [topic].\n\nHere\'s what happened:\n\n[Tell your story]\n\nThe lesson?\n\n[Key takeaway]\n\n♻️ Repost if this resonates\n💬 Share your own experience below' },
    { name: 'Product Announcement', category: 'announcement', content: '🎉 Exciting news!\n\nWe\'re thrilled to announce [announcement].\n\nHere\'s what this means for you:\n\n✅ [Benefit 1]\n✅ [Benefit 2]\n✅ [Benefit 3]\n\nLearn more: [link]\n\n#Announcement #Innovation' },
    { name: 'Quick Tip', category: 'tips', content: '💡 Quick tip for [audience]:\n\n[Your actionable tip]\n\nWhy this matters:\n→ [Reason]\n\nTry it today and let me know how it goes!\n\n#Tips #Productivity' },
    { name: 'Poll Starter', category: 'engagement', content: 'I\'m curious — what\'s your take on [topic]?\n\nOption A: [Option]\nOption B: [Option]\nOption C: [Option]\n\nVote in the comments! 🗳️\n\n#Poll #Community' },
  ];

  let seeded = 0;
  for (const t of defaults) {
    prepare('INSERT INTO templates (id, name, category, content, tags, created_at, updated_at) VALUES (?, ?, ?, ?, \'[]\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)')
      .run(uuidv4(), t.name, t.category, t.content);
    seeded++;
  }

  logActivity('templates_seeded', 'template', null, `Seeded ${seeded} default templates`);
  res.json({ message: `Seeded ${seeded} templates`, seeded });
});

module.exports = router;
