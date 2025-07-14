import express from 'express';

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ message: 'Get all categories' });
});

router.post('/', (req, res) => {
  res.json({ message: 'Create category', data: req.body });
});

export default router;