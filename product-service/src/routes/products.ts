import express from 'express';

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ message: 'Get all products' });
});

router.post('/', (req, res) => {
  res.json({ message: 'Create product', data: req.body });
});

export default router;