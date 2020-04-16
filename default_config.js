"use strict";

module.exports = {
  pageID: "",
  pageStartHour: 11,
  pageEndHour: 23,
  pageInterval: 2,
  smallPageInterval: 1,
  pageStart: "Post #",
  spreadsheetId: "",
  pageAccessToken:"",

  port: process.env.PORT || 5000,

  // App Secret can be retrieved from the App Dashboard
  appSecret: "",

  // Arbitrary value used to validate a webhook
  validationToken: "",

  // Generate a page access token for your page from the App Dashboard
  messagePageAccessToken: "",

  // URL where the app is running (include protocol). Used to point to scripts and
  // assets located at this address.
  serverURL: "",

  checkEnvVariables: function() {
    if (!(appSecret && validationToken && messagePageAccessToken && serverURL)) {
      console.error("Missing config values!");
    }
  }
};
