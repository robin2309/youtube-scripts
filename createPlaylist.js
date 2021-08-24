var fs = require('fs');
var readline = require('readline');
var { google } = require('googleapis');
var moment = require('moment');
var OAuth2 = google.auth.OAuth2;

// If modifying these scopes, delete your previously saved credentials
// at ~/.credentials/youtube-nodejs-quickstart.json
var SCOPES = ['https://www.googleapis.com/auth/youtube'];
var TOKEN_DIR = '.credentials/';
var TOKEN_PATH = TOKEN_DIR + 'youtube-nodejs-quickstart.json';

const youtubeService = google.youtube('v3');

const username = 'TheSailingFrenchman';
const channelId = 'UCjbnS2PJDbVxyF0foCil6oQ';

// Load client secrets from a local file.
fs.readFile('client_secret.json', function processClientSecrets(err, content) {
  if (err) {
    console.log('Error loading client secret file: ' + err);
    return;
  }
  // Authorize a client with the loaded credentials, then call the YouTube API.
  authorize(JSON.parse(content), getChannel);
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  var clientSecret = credentials.installed.client_secret;
  var clientId = credentials.installed.client_id;
  var redirectUrl = credentials.installed.redirect_uris[0];
  var oauth2Client = new OAuth2(clientId, clientSecret, redirectUrl);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, function (err, token) {
    if (err) {
      getNewToken(oauth2Client, callback);
    } else {
      oauth2Client.credentials = JSON.parse(token);
      callback(oauth2Client);
    }
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
function getNewToken(oauth2Client, callback) {
  var authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url: ', authUrl);
  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', function (code) {
    rl.close();
    oauth2Client.getToken(code, function (err, token) {
      if (err) {
        console.log('Error while trying to retrieve access token', err);
        return;
      }
      oauth2Client.credentials = token;
      storeToken(token);
      callback(oauth2Client);
    });
  });
}

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token) {
  try {
    fs.mkdirSync(TOKEN_DIR);
  } catch (err) {
    if (err.code != 'EEXIST') {
      throw err;
    }
  }
  fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
    if (err) throw err;
    console.log('Token stored to ' + TOKEN_PATH);
  });
}

/**
 * Lists the names and IDs of up to 10 files.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function getChannel(auth) {
  youtubeService.channels.list(
    {
      auth: auth,
      part: 'snippet,contentDetails,statistics',
      ...(channelId
        ? {
            id: channelId,
          }
        : {
            forUsername: username,
          }),
    },
    function (err, response) {
      if (err) {
        console.log('The API returned an error: ' + err);
        return;
      }
      var channels = response.data.items;
      if (channels.length == 0) {
        console.log('No channel found.');
      } else {
        getVideos(auth, channels[0].contentDetails.relatedPlaylists.uploads);
      }
    },
  );
}

const getVideosPage = (auth, playlistId, videos, nextPageToken) => {
  return youtubeService.playlistItems
    .list({
      auth: auth,
      maxResults: 50,
      part: ['snippet', 'status'],
      playlistId,
      pageToken: nextPageToken,
    })
    .then((response) => {
      videos = videos.concat(response.data.items);
      if (response.data.nextPageToken) {
        return getVideosPage(
          auth,
          playlistId,
          videos,
          response.data.nextPageToken,
        );
      }
      return Promise.resolve(videos);
    });
};

const sortByPublishedDate = (a, b) => {
  const posA = a.snippet.position;
  const posB = b.snippet.position;
  return posB - posA;
};

const START_VIDEOS_SLICE = 55;
const END_VIDEOS_SLICE = 100;

const insertPlaylistItem = (auth, playlistId, fetchedVideos, index) => {
  return youtubeService.playlistItems
    .insert({
      auth,
      requestBody: {
        snippet: {
          playlistId,
          resourceId: {
            kind: 'youtube#video',
            videoId: fetchedVideos[index].snippet.resourceId.videoId,
          },
        },
      },
      part: 'snippet',
    })
    .then((response) => {
      console.log('ADDED !');
      const newIndex = index + 1;
      if (Boolean(fetchedVideos[newIndex])) {
        return insertPlaylistItem(auth, playlistId, fetchedVideos, newIndex);
      }
      return Promise.resolve(true);
    });
};

function getVideos(auth, playlistId) {
  getVideosPage(auth, playlistId, []).then((fetchedVideos) => {
    console.log(fetchedVideos.length);
    youtubeService.playlists
      .insert({
        auth,
        requestBody: { snippet: { title: username } },
        part: 'snippet',
      })
      .then((response) => {
        const playlistId = response.data.id;
        const slicedVideos = fetchedVideos
          .sort(sortByPublishedDate)
          .slice(START_VIDEOS_SLICE, END_VIDEOS_SLICE - 1);
        return insertPlaylistItem(auth, playlistId, slicedVideos, 0);
      })
      .then((resp) => {
        console.log('DONE');
      })
      .catch((err) => {
        console.log('ERR');
        console.log(err);
      });
  });
}
