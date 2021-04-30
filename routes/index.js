var express = require('express');
var router = express.Router();
var appController = require('../controllers/appController');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

/**
 * Get sentiment score about specific hashtag.
 * Limiting 100 tweets, and each hashtag will
 * be stored in Redis & S3 with exp_time for 1 hour
 * before it will be outdated.
 * 
 * 3 middlewares:
 * - Twitter middleware: Get 100 tweets about #hashtag
 * - Sentiment middleware: Analyse sentiment with given tweets
 * - Render middleware: Render the page with given sentiment score
 */
router.get('/sentiment', 
  appController.getTweets, 
  appController.analyseSentiment,
  appController.savePersistence, 
  appController.renderSentiment);


module.exports = router;
