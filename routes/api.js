var express = require('express');
var router = express.Router();
var appController = require('../controllers/appController');

/**
 * Get sentiment score about specific hashtag.
 * Limiting 100 tweets, and each hashtag will
 * be stored in Redis & S3 with exp_time for 1 hour
 * before it will be outdated.
 * 
 * 3 middlewares:
 * - Twitter middleware: Get 100 tweets about #hashtag
 * - Sentiment middleware: Analyse sentiment with given tweets
 * - Json middleware: Send back the recent sentiment score
 */
router.get('/sentiment', 
  appController.getTweets, 
  appController.analyseSentiment,
  appController.savePersistence, 
  appController.jsonSentiment);

router.get('/snapshot', appController.getSnapsnot);


module.exports = router;
