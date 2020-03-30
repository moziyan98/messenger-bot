
const
  got = require('got'),
  config = require("./config"),
  https = require('https'),
  FB = require('fb');
// Endpoint for messages
let MESSAGE_URL = "/me/messages";
FB.setAccessToken(config.messagePageAccessToken);

module.exports = class GraphAPi{
  /*
    Wraps the message in json
   */
  static wrapMessage (recipientId, message){
    return {
      recipient: {
        id: recipientId
      },
      message: {
        text: message
      }
    };
  }

  /*
   * Call the Send API. The message data goes in the body. If successful, we'll
   * get the message id in a response
   */
  static sendMessageApi (messageData) {
    FB.setAccessToken(config.messagePageAccessToken);
    FB.api(
      "/me/messages",
      'post',
      messageData,
      function (response) {
        if (response && !response.error) {
        }
        else {
          console.log(response);
        }
      }
    );
  }

  /*
   * Call the getMessage API with message id. If successful, we'll
   * get the message in a response
   */
  static getMessageApi (messageId) {
    FB.setAccessToken(config.messagePageAccessToken);
    return new Promise(function(resolve, reject) {
      FB.api(
        `/${messageId}`,
        'get',
        {
          "fields": "message,from"
        },
        function (response) {
          if (response.error) {
            reject(Error(response.error));
          }
          else {
            resolve(response.message);
          }
        }
      );
    });
  }

  /*
   * Call the getScheduledPost API with pageID. If successful, we'll
   * get a response with a list of scheduled posts.
   */
  static getScheduledPosts(){
    FB.setAccessToken(config.pageAccessToken);
    return new Promise(function(resolve, reject) {
      FB.api(
        "/"+config.pageID+"/scheduled_posts",
        function (response) {
          if (response && !response.error) {
              resolve(response);
          }
          else {
            console.log(response);
            reject(Error(response.error));
          }
        }
      );
    });
  }

  /*
   * Call the getPublishedPosts API with pageID. If successful, we'll
   * get a response with a list of scheduled posts.
   */
  static async getPublishedPosts(){
    // We have two separate pages, so set the relevant one.
    FB.setAccessToken(config.pageAccessToken);
    return new Promise(function(resolve, reject) {
      FB.api(
        '/'+config.pageID+'/feed',
        'GET',
        {"limit":"2"},
        function(response) {
          if (response && !response.error) {
            resolve(response);
          }
          else{
            reject(Error(`error in fetching published posts`));
          }
        }
      );
    });
  }

  /*
   * Call the schedulePost API. The message data, scheduled time goes in the body.
   * If successful, we'll get the post id in a response
   */
  static schedulePost(post_message, time, id) {
    FB.setAccessToken(config.pageAccessToken);
    FB.api(
      "/"+config.pageID+"/feed",
      "POST",
      {
          "message": `${config.pageStart}${String(id)}: ${post_message}`,
          "published": false,
          "scheduled_publish_time": Date.parse(time)/1000
      },
      function (response) {
        if (response && !response.error) {

        }
        else {
            console.log(response.error);
        }
      }
    );

  }
}
