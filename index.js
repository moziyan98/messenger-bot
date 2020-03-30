'use strict';

const
  bodyParser = require('body-parser'),
  crypto = require('crypto'),
  express = require('express'),
  https = require('https'),
  config = require("./config"),
  GraphApi = require("./graphApi"),
  GoogleSheetsApi = require("./googleSheetsApi");


var app = express();
app.set('port', config.port);
app.set('view engine', 'ejs');
app.use(bodyParser.json({ verify: verifyRequestSignature }));
app.use(express.static('public'));
let googleSheetsApi = new GoogleSheetsApi();

// Flow: User messages "Check" -> Fetches the unseen rows from google ->
// returns that, and for each unseen row, print it as a separate message.
// User replies to the message with "yes", "no", "manual", and depending
// on answer, we use the message from the reply-to to post it. We will
// Need to look at the last post time. If that is unavailable, we will
// need to manually set the time and number to start from in the code most likely.


// Creates the endpoint for our webhook
app.post('/webhook', (req, res) => {
  let body = req.body;
  // Checks this is an event from a page subscription
  if (body.object === 'page') {

    // Iterates over each entry - there may be multiple if batched
    body.entry.forEach(function(entry) {
      var pageID = entry.id;
      var timeOfEvent = entry.time;
      // Gets the message. entry.messaging is an array, but
      // will only ever contain one message, so we get index 0
      entry.messaging.forEach(function(messagingEvent) {
        if (messagingEvent.message) {
          receivedMessage(messagingEvent);
        } else {
          console.log("Webhook received unknown messagingEvent: ", messagingEvent);
        }
      });
    });

    // Returns a '200 OK' response to all requests
    res.status(200).send('EVENT_RECEIVED');
  } else {
    // Returns a '404 Not Found' if event is not from a page subscription
    res.sendStatus(404);
  }

});

/*
 * Check that the token used in the Webhook setup is the same token used here.
 *
 */
app.get('/webhook', function(req, res) {
  if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === config.validationToken) {
    console.log("Validating webhook");
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);
  }
});

/*
 * Verify that the callback came from Facebook. Using the App Secret from
 * the App Dashboard, we can verify the signature that is sent with each
 * callback in the x-hub-signature field, located in the header.
 *
 *
 */
function verifyRequestSignature(req, res, buf) {
  var signature = req.headers["x-hub-signature"];

  if (!signature) {
    // For testing, let's log an error. In production, you should throw an
    // error.
    console.error("Couldn't validate the signature.");
  } else {
    var elements = signature.split('=');
    var method = elements[0];
    var signatureHash = elements[1];

    var expectedHash = crypto.createHmac('sha1', config.appSecret)
                        .update(buf)
                        .digest('hex');

    if (signatureHash != expectedHash) {
      throw new Error("Couldn't validate the request signature.");
    }
  }
}

/*
 * Message Event
 *
 * This event is called when a message is sent to your page. The 'message'
 * object format can vary depending on the kind of message that was received.
 * Read more at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-received
 *
 * For this example, we're going to echo any text that we get. If we get some
 * special keywords ('button', 'generic', 'receipt'), then we'll send back
 * examples of those bubbles to illustrate the special message bubbles we've
 * created. If we receive a message with an attachment (image, video, audio),
 * then we'll simply confirm that we've received the attachment.
 *
 */
function receivedMessage(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfMessage = event.timestamp;
  var message = event.message;

  console.log("Received message for user %d and page %d at %d with message:",
    senderID, recipientID, timeOfMessage);
  console.log(JSON.stringify(message));

  var messageId = message.mid;
  var appId = message.app_id;
  var metadata = message.metadata;

  var reply_to = message.reply_to;
  var reply_mid = "";

  // If it is a reply_to, we need to get the message id as well as
  // the actual message so we can post it.
  if (reply_to) {
    reply_mid = reply_to.mid;
  }

  var messageText = message.text;

  if (messageText) {
    switch (messageText.replace(/[^\w\s]/gi, '').trim().toLowerCase()) {
      case 'check':
        getLatestConfessions(senderID);
        break;
      case 'check unread':
        getUnreadConfessions(senderID);
        break;
      case 'yes':
        updateSheet(reply_mid, senderID, true);
        break;
      case 'no':
        updateSheet(reply_mid, senderID, false);
        break;
      case 'manual':
      default:
        console.log("Other messages");

    }
  }
}

/*
* Called when user messages "check unread"
 * Given a receientID, look at the last 400+ entries on the
 * spreadsheet and sent the ones that aren't decided to the receipent;
 */
function getUnreadConfessions(recipientID){
  googleSheetsApi.getConfessions(
    recipientID,
    googleSheetsApi.lastRead - 400,    GraphApi.wrapMessage,
    GraphApi.wrapMessage,
    GraphApi.sendMessageApi,
  );
}

/*
 * Called when user messages "check"
 * Given a receientID, look at the newest entries since we last fetched
 * submissions.
 */
function getLatestConfessions(recipientID){
  googleSheetsApi.getConfessions(
    recipientID,
    googleSheetsApi.lastRead,
    GraphApi.wrapMessage,
    GraphApi.sendMessageApi,
  );
}

/**
 * Called when user messages "yes" or "no"
 * Checks if this message is actually a reply.
 * Gets the corresponding message to reply_mid.
 * @param {string} reply_mid - the message id that user replies to.
 * @param {string} or {integer} recipientID - user who messaged the page.
 * @param {boolean} post - Will this submission be posted.
 */
function updateSheet(reply_mid, recipientID, post) {
  // Is this message replying to anything?
  if (reply_mid){
      GraphApi.getMessageApi(reply_mid)
      .then((reply_message) => updateSheetHandler(reply_message, post))
      .catch((err) => console.log("3"+err));
  }
}

/**
 * If this reply_message is in a valid format, we update the spreadsheet with
 * corresponding colors.
 * If we want to post this confession,
 * then get the next confession number and the next timeslot
 * and schedule the post.
 * @param {string} reply_message -  function expects the format
 * `{integer} {string}`
 * @param {boolean} post - Will this submission be posted.
 */
function updateSheetHandler(reply_message, post) {
  // Expects format in `{google sheets row} {confessionSubmission}`
  let id = parseInt(reply_message.substr(0, reply_message.indexOf(' ')));
  reply_message = reply_message.substr(reply_message.indexOf(' ')+1);
  if (id ){
    googleSheetsApi.updateConfessionSpreadsheet(id, post).catch((err) => console.log(err));
    if (post){
      getNextScheduledTime()
      .then((timeAndId) => GraphApi.schedulePost(reply_message, timeAndId[0], timeAndId[1]))
      .catch((err) => console.log(err));
    }
  }
}

/**
 * Find the last time-wise message and time in a response object.
 * @param {Object} response - response from facebook APIs
 */
async function findLatestTimes(response){
  let latestMessage = '';
  let latestTime = 0;
  if (response.data !== undefined && response.data.length != 0)
  {
    response.data.forEach(function(post){
        if (latestTime < Date.parse(post.created_time)) {
          latestTime = Date.parse(post.created_time);
          latestMessage = post.message;
        }
    });
    return {latestTime: latestTime, latestMessage: latestMessage}
  }
  return {}
}

/**
 * Finds the next available timeslot to post and the next confession id.
 */
async function getNextScheduledTime(){
  try{
    var latestTime = 0;
    var latestMessage = "";
    // First sees if there are already scheduled posts.
    var response = await GraphApi.getScheduledPosts();
    var timeMessage = await findLatestTimes(response);
    // If there are no scheduled post, find the last confession id.
    if (timeMessage.length === 0)
    {
      response = await GraphApi.getPublishedPosts();
      timeMessage = await findLatestTimes(response);
    }
    latestMessage = timeMessage.latestMessage;
    latestTime = Math.max(timeMessage.latestTime, Date.now());
    latestMessage = latestMessage.split(" ", 2)[1];

    // All confessions should be in "Confession #{integer}" format.
    if ("#" !== latestMessage[0]){
      throw `Can't retrieve last post number`;
    }
    // Get rid of the # infront.
    var latestMessageId = parseInt(latestMessage.substring(1));
    latestTime = new Date(latestTime);

    var latestDay = latestTime.getDay();
    latestTime.setHours(latestTime.getHours() + config.pageInterval);

    // If the days are not the same day, then
    // we need to change the hour since this would likely be 1am.
    if (latestDay != latestTime.getDay()){
      latestTime.setHours(config.pageStartHour);
    }
    return [latestTime, latestMessageId+1];
  }
  catch (err) {
    throw `Can't retrieve last post number`;
  }
}

app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});

module.exports = app;
