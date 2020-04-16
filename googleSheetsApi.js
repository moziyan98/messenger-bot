const
  fs = require('fs'),
  readline = require('readline'),
  {google} = require('googleapis'),
  config = require("./config");

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json';

module.exports = class GoogleSheetsApi{
  constructor() {
    // Hard set a lastRead instead of reading everything from the beginning.
    this.lastRead = 21900;
    this.auth = '';
    // Load client secrets from a local file.
    fs.readFile('credentials.json', (err, content) => {
      if (err) return console.log('Error loading client secret file:', err);
      this.setAuth.bind(this);
      this.authorize(JSON.parse(content), this.setAuth);
    });
  }

  setAuth(myself, auth) {
    myself.auth = auth;
  }

  /**
   * Create an OAuth2 client with the given credentials, and then execute the
   * given callback function.
   * @param {Object} credentials The authorization client credentials.
   * @param {function} callback The callback to call with the authorized client.
   */
  authorize(credentials, callback) {
    const {client_secret, client_id, redirect_uris} = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
        client_id, client_secret, redirect_uris[0]);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, (err, token) => {
      if (err) return this.getNewToken(oAuth2Client, callback);
      oAuth2Client.setCredentials(JSON.parse(token));
      callback(this, oAuth2Client);
    });
  }

  /**
   * Get and store new token after prompting for user authorization, and then
   * execute the given callback with the authorized OAuth2 client.
   * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
   * @param {getEventsCallback} callback The callback for the authorized client.
   */
  getNewToken(oAuth2Client, callback) {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
    });
    console.log('Authorize this app by visiting this url:', authUrl);
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question('Enter the code from that page here: ', (code) => {
      rl.close();
      oAuth2Client.getToken(code, (err, token) => {
        if (err) return console.error('Error while trying to retrieve access token', err);
        oAuth2Client.setCredentials(token);
        // Store the token to disk for later program executions
        fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
          if (err) return console.error(err);
          console.log('Token stored to', TOKEN_PATH);
        });
        callback(this, oAuth2Client);
      });
    });
  }

  /**
   * Fetches confession submissions, and send unread ones to recipient.
   * @param {string} or {integer} recipientID - Recipient of confession
   * submissions
   * @param {integer} startRange Row index of a spreedsheet.
   * @param {function} wrapMessage Function for packaging a FB message.
   * @param {function} sendMessageApi Function for sendind FB message.
   */
  getSubmissions(recipientID, startRange, wrapMessage, sendMessageApi) {
    let auth = this.auth;
    if (auth) {
      const sheets = google.sheets({version: 'v4', auth});
      sheets.spreadsheets.get({
        spreadsheetId: config.spreadsheetId,
        ranges: ['Form Responses 1!B'+String(startRange)+":B"],
        // Only need specific data.
        fields: 'sheets.data.rowData.values.formattedValue,sheets.data.rowData.values.effectiveFormat.backgroundColor',
        includeGridData: true,
      }, (err, res) => {
        if (err) return console.log('The API returned an error: ' + err);

        const rows = res.data.sheets[0].data[0].rowData;
        if (rows && rows.length) {
          rows.forEach((row, indx) => {
            const colors = row.values[0].effectiveFormat.backgroundColor;
            if (colors.red === 1 && colors.green === 1 && colors.blue === 1)
            {
              sendMessageApi(wrapMessage(recipientID, String(startRange+indx)+" "+row.values[0].formattedValue));
            }
          });
          // Update the number of rows seen.
          this.lastRead = Math.max(startRange+rows.length, this.lastRead);
          return rows;
        } else {
          sendMessageApi(wrapMessage(recipientID, "No new submissions!"));
        }
      });
    }
  }

  /**
   * Updates a row in confessions spreadsheet based on if it's posted or not.
   * @param {string} or {integer} id - Row index
   * @param {boolean} post - To post confession or not.
   */
  async updateSpreadsheet(id, post) {
    // Gray for posted, yellow for not going to be posted.
    let color = post ?
      { red: 153/255, green: 153/255, blue: 153/255}:
      { red: 255/255, green: 242/255, blue: 204/255};
    const request = {
      spreadsheetId: config.spreadsheetId,
      resource: {
        requests: [
          {
            // Use repeatCell since updateCell doesn't seem to work properly.
            repeatCell: {
              range: {
                sheetId:453590230,
                // They index from 0
                startRowIndex: id-1,
                startColumnIndex: 0,
                endRowIndex: id
              },
              fields: 'userEnteredFormat',
              cell:
                {
                  userEnteredFormat: {
                    backgroundColor: color,
                  },
                },
            },
          },
        ],
      },
    };
    try {
      let auth = this.auth;
      // Do we have a valid auth.
      if (auth) {
        const sheets = google.sheets({version: 'v4', auth});
        const result = await sheets.spreadsheets.batchUpdate(request);
      }
      else {
        throw `no valid auth!`;
      }
    } catch (error) {
      throw `update row error ${error}`;
    }
  }
}
