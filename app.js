var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var routes = require('./routes/index');
var users = require('./routes/users');

var app = express();

var firebase = require("firebase");

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', routes);
app.use('/users', users);









//FIREBASE PORTION
var firebase = require("firebase");
firebase.initializeApp({
  serviceAccount: "./serviceAccountCredentials.json",
  databaseURL: "https://logoquizz-tournament.firebaseio.com"
});

var db = firebase.database();
var ref = db.ref("/queue");
var crtRoomID = 0 ;
var waitMakeMatching = false;
//Async call when a users enter in queue
ref.on("value", function(snapshot) {
   var obj = snapshot.val();
   if(waitMakeMatching == false)
        makeMatching(obj);
}, function (errorObject) {
  console.log("The read failed: " + errorObject.code);
});

function makeMatching(obj) {
    if(obj != null){
        waitMakeMatching = true;

        var nrOfQueueUsers = Object.keys(obj).length;
        console.log("Number of queue users: ", nrOfQueueUsers);

        while(nrOfQueueUsers >= 2) {
            var key1 = null, key2 = null;
            for(var key in obj) {
                if(obj[key] == null)
                    continue;

                console.log("Key: " + key);

                //Choose the two players
                if(key1 == null)
                    key1 = key;
                else {
                    key2 = key;
                    break;
                }
            }

            //Deleting selected users from room
            var deleteRef = db.ref("/queue").child(key1);    deleteRef.remove();  obj[key1] = null;
            var deleteRef = db.ref("/queue").child(key2);    deleteRef.remove();  obj[key2] = null;

            //Setting the new room with two users
            var roomRef = db.ref("/rooms");
            roomRef.child(crtRoomID).set({
              player1: key1,
              player2: key2,
              gameStatus: "ToDo"
            });

            var userRef = db.ref("/connectedUsers").child(key1).update({"GAME_ROOM": String(crtRoomID)});
            var userRef = db.ref("/connectedUsers").child(key1).update({"GAME_ROOM": String(crtRoomID)});

            nrOfQueueUsers -= 2;
            crtRoomID += 1;
        }

        waitMakeMatching = false;
    }
}













// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});


module.exports = app;
