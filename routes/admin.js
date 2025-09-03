import express from 'express';
import { getBlockedTopics, clearBlockedTopics } from '../database/index.js';

const router = express.Router();

// Admin dashboard
router.get('/admin', async (req, res) => {
  try {
    const blockedTopics = await getBlockedTopics();
    res.render('admin', { blockedTopics: blockedTopics });
  } catch (error) {
    console.error('Error loading admin page:', error);
    res.status(500).render('error', { message: 'Error loading admin page.' });
  }
});

// Clear blocked topics
router.post('/admin/clear-blocked', async (req, res) => {
  try {
    const deletedCount = await clearBlockedTopics();
    console.log(`Admin action: Cleared ${deletedCount} blocked topics`);
    res.redirect('/admin');
  } catch (error) {
    console.error('Error clearing blocked topics:', error);
    res.status(500).render('error', { message: 'Error clearing blocked topics.' });
  }
});

export default router;