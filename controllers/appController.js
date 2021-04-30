var express = require('express');
var axios = require('axios').default;
var AppError = require('../utils/appError');
var catchAsync = require('../utils/catchAsync');
const { promisify } = require('util');

// ------------------------
// NLP Analysis libs
var natural = require('natural');
var Analyzer = natural.SentimentAnalyzer;
var stemmer = natural.LancasterStemmer;
var analyzer = new Analyzer("English", stemmer, "afinn");

const aposToLexForm = require('apos-to-lex-form');
const SW = require('stopword');

var tokenizer = new natural.WordTokenizer();
// -------------------------


// ------------------------
// Cloud Redis

const RedisClient = require('redis');
const RedisCluster = require('redis-clustr');

let redisClient;

if(process.env.NODE_ENV === 'development'){

  redisClient = RedisClient.createClient(
    6379, 
    process.env.REDIS_HOST_LOCAL, 
    {no_ready_check: true}
  );
} else {
  redisClient = new RedisCluster({
    servers:[
      {
        host: process.env.REDIS_HOST_AWS,
        port: 6379
      }
    ],
    createClient: function(port, host){
      
      return RedisClient.createClient(port, host);
    }
  })
}

redisClient.on('connect', (data) => {
  console.log('ElasticCache-Redis connected');
})

// Promisify all of the Redis operations, avoiding Callback-hell
const getAsync = promisify(redisClient.get).bind(redisClient);
const setExAsync = promisify(redisClient.setex).bind(redisClient);
const setAsync = promisify(redisClient.set).bind(redisClient);
// ------------------------

// ------------------------
// AWS S3 Bucket
const AWS = require('aws-sdk');


const awsCredentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_KEY
}

AWS.config.update(awsCredentials);

AWS.config.getCredentials(function(err){
  if(err) console.log(err.stack)
  else{
    console.log('Access key:', AWS.config.credentials.accessKeyId);
    console.log('Secret access key:', AWS.config.credentials.secretAccessKey);
  }
})

const bucketName = 'blakelusanneys3';

const S3 = new AWS.S3({ apiVersion: '2006-03-01'});

S3.createBucket({Bucket: bucketName}).promise().then(data => {
  console.log('AWS S3 Bucket connected');
})
.catch(err => console.log(err));

// ------------------------

/**
 * Controller that get 100 recent tweets
 * about specific #hashtag.
 * 
 * Results will be attached to req object
 * 
 * @param {express.Request} req - Express Request
 * @param {express.Response} res - Express Response
 * @param {express.NextFunction} next - Express Next
 */
exports.getTweets = catchAsync(async (req, res, next) => {
  let hashtag = req.query.hashtag;

  // If it has timestamp, pass it with getTweetByTimestamp
  if(req.query.timestamp){
    getTweetBySnapshot(req, res, next);
    return;
  }
  
  console.log(hashtag);

  // validation
  if (!hashtag || hashtag.length === 0)
    return next(new AppError("Please provide hashtag", 400))

  // Filter '#' because we already made #
  if (hashtag.startsWith("#"))
    hashtag = hashtag.substring(1, hashtag.length);

  req.query.hashtag = hashtag;

  let redisResult;
  // If result is in Redis, serve it
  if ((redisResult = await getAsync('#' + req.query.hashtag))) {
    const result = JSON.parse(redisResult);
    req.sentiment = result;
    req.source = 'redis';
  }
  // Else, go to Twitter
  else {
    // Result of tweets as a full text
    const twitter_res = await
    axios('https://api.twitter.com/1.1/search/tweets.json', {
      params: {
        count: 100,
        q: "#" + hashtag,
        result_type: 'mixed',
        tweet_mode: 'extended',
        lang: 'en'
      },
      headers: {
        'Authorization': 'Bearer ' + process.env.TWITTER_BEARER
      }
    });

    const tweets = twitter_res.data.statuses;

    // Attach to req object
    tweets.sort((t1, t2) => 
      (t2.favorite_count + t2.retweet_count)
      -  
      (t1.favorite_count + t1.retweet_count)
    );

    req.tweets = tweets;
    req.source = 'twitter';
  }
    
  next();
});

/**
 * [PRIVATE]
 * Controller that get specific tweet by hashtag
 * and timestamp, in other word, get by snapshot.
 * 
 * Remarks:
 *  - timestamp is in Unix-like "long" value
 *  - this controller is private, only accessible by getTweets above
 *  - this controller assume that hashtag & timestamp is provided,
 *      so don't use it if you don't have timestamp on the hand
 * 
 * Results will be attached to req object
 * 
 * @param {express.Request} req - Express Request
 * @param {express.Response} res - Express Response
 * @param {express.NextFunction} next - Express Next
 */
const getTweetBySnapshot = catchAsync(async (req, res, next) => {
  let timestamp = req.query.timestamp;

  // If the snapshot is in Redis, serve it
  let redisResult;
  if((redisResult = await getAsync("#" + req.query.hashtag + "_snap" ))){
    const result = JSON.parse(redisResult);
    req.sentiment = result.filter(value => value.timestamp === timestamp*1)[0];
    req.source = 'redis';
    next();
    return;
  } 

  // If not in Redis, look in S3
  let s3GetParams = {
    Bucket: bucketName,
    Key: '#' + req.query.hashtag
  };
  let s3Result = S3.getObject(s3GetParams).promise();

  s3Result.then(value => {
    const result = JSON.parse(value.Body);
    req.sentiment = result.filter(value => value.timestamp === timestamp*1)[0];
    req.source = 's3';
    next();
    return;
  })
  .catch(err => {
    console.log(err);
    next(new AppError(err.code, 500))}
  
  );
  
});

/**
 * Controller that received 100 tweets from above
 * controller and start sentiment analysis.
 * 
 * Sentiment scores result will be attached to req obj
 * 
 * @param {express.Request} req - Express Request
 * @param {express.Response} res - Express Response
 * @param {express.NextFunction} next - Express Next
 */
exports.analyseSentiment = (req, res, next) => {
  if(req.source !== 'twitter'){
    next();
    return;
  }

  // Get tweets from req object
  const tweets = req.tweets;
  console.log(tweets.length);
  let totalSentiment = 0;
  let tweetCount = 0;

  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;

  // Analyse here...
  tweets.forEach(tweet => {
    let text = tweet.full_text; //.replace(/\W/g, ' ');

    // Tokenizing and filtering stop words
    text = aposToLexForm(text);
    text = tokenizer.tokenize(text);
    text = SW.removeStopwords(text);

    // Get sentiment score
    const tweetScore = analyzer.getSentiment(text);

    // Positive & Negative filtering
    if (tweetScore !== 0) {
      if (tweetScore > 0)
        positiveCount++;
      else
        negativeCount++;

      totalSentiment += analyzer.getSentiment(text);
      tweetCount++;
    } 
    else 
      neutralCount++;
    
    tweet.sentimentScore = tweetScore;
  });

  const avgScore = (totalSentiment / tweetCount);
  console.log("average score: " + avgScore.toFixed(2));

  let top5tweets = tweets.slice(0,5);;

  // Attach the sentiment score to req object
  req.sentiment = {
    timestamp: Date.now(),
    avgScore,
    top5tweets,
    count: {
      positiveCount,
      negativeCount,
      neutralCount
    }
  };

  next();
}

/**
 * Controller that store sentiment results to S3
 * bucket as a history and Redis as a recent result
 * 
 * Note that, we only apply this to Twitter source,
 * because we don't save anything that already in Redis
 * 
 * @param {express.Request} req - Express Request
 * @param {express.Response} res - Express Response
 * @param {express.NextFunction} next - Express Next
 */
exports.savePersistence = catchAsync(async (req, res, next) => {
  if(req.source !== 'twitter'){
    next();
    return;
  }

  //  Save into Redis the most recent sentiment
  await setExAsync("#" + req.query.hashtag, process.env.TWITTER_EXP / 1000, JSON.stringify(req.sentiment));

  // Get the object from S3
  let s3GetParams = {
    Bucket: bucketName,
    Key: '#' + req.query.hashtag
  };
  
  const s3GetSnapshot = S3.getObject(s3GetParams).promise();

  let snapshots = [];

  let s3PutParams = {
    Bucket: bucketName,
    Key: '#' + req.query.hashtag
  };

  s3GetSnapshot.then(value => {
    snapshots = JSON.parse(value.Body);

    // Only 10 snapshots are available
    if(snapshots.length > 10)
      snapshots.shift();
    
    // Push recent tweets to the snapshot history
    snapshots.push(req.sentiment);

    s3PutParams.Body = JSON.stringify(snapshots);

    S3.putObject(s3PutParams, (err, data) => {
      if(err){
        console.log(err);
      }
    })
  })
  .catch(err => {
    if(err.code === 'NoSuchKey'){
      snapshots.push(req.sentiment);
      s3PutParams.Body = JSON.stringify(snapshots);

      S3.putObject(s3PutParams, (err, data) => {
        if(err){
          console.log(err);
        }
      })
    }
  })

  next();
});

/**
 * Controller that get all the snapshots (history)
 * of given hashtag. Please note that, because it
 * is stateless, so depends upon demand of users.
 * 
 * Only for hot topic, the snapshot is much more 
 * in details.
 * 
 * @param {express.Request} req - Express Request
 * @param {express.Response} res - Express Response
 * @param {express.NextFunction} next - Express Next
 */
exports.getSnapsnot = catchAsync(async (req, res, next) => {
  let hashtag = req.query.hashtag;
  console.log(hashtag);

  // validation
  if (!hashtag || hashtag.length === 0)
    return next(new AppError("Please provide hashtag", 400))

  // Fetch from Redis first
  const snapshots = await getAsync("#" + req.query.hashtag + "_snap" );
  if(snapshots){
    res.status(200).json(JSON.parse(snapshots));
    return;
  }
  
  // If not from Redis, fetch from S3
  let s3GetParams = {
    Bucket: bucketName,
    Key: '#' + req.query.hashtag
  };
  const s3GetSnapshot = S3.getObject(s3GetParams).promise();

  s3GetSnapshot.then(value => {
    const snapshots = JSON.parse(value.Body);

    res.status(200).json(snapshots);

    // Save in redis for a while
    setExAsync("#" + req.query.hashtag + "_snap" , 60, JSON.stringify(snapshots));
    
  })
  .catch(err => {
    if(err.code === 'NoSuchKey'){
      res.status(200).json([]);
    }
  })
  
});

/**
 * Controller that received sentiment score
 * and render to PUG template
 * 
 * @param {express.Request} req - Express Request
 * @param {express.Response} res - Express Response
 * @param {express.NextFunction} next - Express Next
 */
exports.renderSentiment = (req, res, next) => {

  // Ending middleware
  res.render('search', { hashtag: req.query.hashtag, sentiment: JSON.stringify(req.sentiment) });
}

/**
 * Controller that received sentiment score
 * and return JSON. It will be used in Postman
 * 
 * @param {express.Request} req - Express Request
 * @param {express.Response} res - Express Response
 * @param {express.NextFunction} next - Express Next
 */
exports.jsonSentiment = (req, res, next) => {
  // Ending middleware
  res.status(200).json({
    source: req.source,
    sentiment: req.sentiment
  })
}