const express = require('express');
const { requireAuth } = require('../middleware/auth');
const modelClient = require('../services/modelClient');

const router = express.Router();
router.use(requireAuth);

router.get('/schema', async (req, res, next) => {
  try {
    res.json(await modelClient.getSchema());
  } catch (err) {
    next(err);
  }
});

router.get('/feature-importance', async (req, res, next) => {
  try {
    res.json(await modelClient.getFeatureImportance());
  } catch (err) {
    next(err);
  }
});

module.exports = router;