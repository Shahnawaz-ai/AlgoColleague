const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const crypto = require('crypto');
const { dbRun } = require('../db');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

router.post('/roadmap', async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { roadmap } = req.body;

    if (!roadmap) {
      return res.status(400).json({ error: 'Roadmap text is required' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured' });
    }

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
      }
    });

    const prompt = `
      You are an expert LinkedIn ghostwriter and social media manager.
      The user has provided a 1-month roadmap for their LinkedIn content strategy.
      Your task is to analyze this roadmap and generate EXACTLY 30 highly engaging LinkedIn posts.
      
      For each post, provide:
      - "content": The actual text of the post (include emojis, line breaks, and professional formatting).
      - "day_offset": An integer from 1 to 30 representing which day from today the post should be scheduled.
      - "tags": A JSON array of 2-4 relevant hashtags (e.g. ["#leadership", "#tech"]).

      User Roadmap:
      "${roadmap}"

      Return a JSON array of 30 post objects.
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    let generatedPosts;
    try {
      generatedPosts = JSON.parse(responseText);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to parse AI response as JSON', details: responseText });
    }

    if (!Array.isArray(generatedPosts) || generatedPosts.length === 0) {
      return res.status(500).json({ error: 'AI did not return a valid array of posts' });
    }

    const savedPosts = [];
    const now = new Date();

    for (const p of generatedPosts) {
      const postId = crypto.randomUUID();
      
      // Calculate scheduled date (day_offset days from now, at 10:00 AM local time approx)
      const scheduledDate = new Date(now);
      scheduledDate.setDate(scheduledDate.getDate() + (p.day_offset || 1));
      scheduledDate.setHours(10, 0, 0, 0);

      const content = p.content || '';
      const tags = JSON.stringify(p.tags || []);
      
      await dbRun(
        `INSERT INTO posts (
          id, user_id, content, post_type, status, scheduled_at, tags, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        postId,
        userId,
        content,
        'text',
        'draft',
        scheduledDate.toISOString(),
        tags
      );

      savedPosts.push({ id: postId, content, scheduled_at: scheduledDate.toISOString() });
    }

    res.json({ success: true, count: savedPosts.length, posts: savedPosts });

  } catch (error) {
    console.error('AI Roadmap Error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
