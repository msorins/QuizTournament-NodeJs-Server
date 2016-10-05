var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var FCM = require('fcm-push');

var index = require('./routes/index');
var addquiz = require('./routes/addquiz');
var importQuizzes = require("./routes/importQuizzes");

app = express();

var firebase = require("firebase");

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: false
}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', index);
app.use('/add', addquiz);
app.use('/import', importQuizzes);




//FCM Cloud Messaging setup
var serverKey = 'AIzaSyCFlsxjBOyNnch6UB9wpNTQBRBmp5KYSHk';
var fcm = new FCM(serverKey);


//Google Cloud Portion ( for FireBase Storage )
gcloud = require('gcloud')({
    keyFilename: "./serviceAccountCredentials.json",
    projectId: "logoquizz-tournament"
});
gcs = gcloud.storage();
bucket = gcs.bucket("logoquizz-tournament.appspot.com");

//FIREBASE PORTION
firebase = require("firebase");
firebase.initializeApp({
    serviceAccount: "./serviceAccountCredentials.json",
    databaseURL: "https://logoquizz-tournament.firebaseio.com"
});

db = firebase.database();


pendingQuizzesObject = {};
quizzesObject = {};
usersObject = {};
statsObject = {};

//USER SECTION
var refQuizzes = db.ref("/connectedUsers");
refQuizzes.on("value", function(snapshot) {
    usersObject = snapshot.val();
}, function(errorObject) {
    console.log("The read failed: " + errorObject.code);
});


//QUEUE SECTION
var ref = db.ref("/queue");

var waitMakeMatching = false,
    waitFindAndComputeRooms = false;

//Async call when a users enter in queue
ref.on("value", function(snapshot) {
    console.log("QUEUE Section Updated");
    var obj = snapshot.val();
    if (waitMakeMatching == false)
        processQueueEntries(obj);

}, function(errorObject) {
    console.log("The read failed: " + errorObject.code);
});

function processQueueEntries(obj) {
    console.log("processQueueEntries function called");
    waitMakeMatching = true;

    obj = validateQueueEntries(obj);
    obj = AiQueueEntries(obj);
    makeMatching(obj);

    waitMakeMatching = false;
}

function validateQueueEntries(obj) {
    console.log("validateQueueEntries function called");
    if (obj != null ) {
        for (var i in obj) {
            var userTimeStamp = parseInt(usersObject[i].TIME);
            var currentTimeStamp = parseInt(Date.now());
            var differenceTimeStamp = currentTimeStamp - userTimeStamp;
            console.log(differenceTimeStamp);
            if (differenceTimeStamp >= 8000) {
                console.log(`Queue with user id ${i} removed - Timeout`);
                db.ref("/queue").child(i).remove();
                obj[i] = null;
            }
        }
    }
    return obj;
}

function AiQueueEntries(obj) {
    console.log("AiQueueEntries function called");
    if( obj != null ) {
        for (var key in obj) {
            if (obj[key] == null)
                continue;

            var userTimeStamp = parseInt(obj[key].ENTERTIME);
            var currentTimeStamp = parseInt(Date.now());
            var differenceTimeStamp = currentTimeStamp - userTimeStamp;
            if (differenceTimeStamp >= 8000) {
                //INITIATING THE QUIZZ WITH AI
                console.log(`Queue - user with id ${key} is playing with AI`);
                db.ref("/queue").child(key).remove();

                var crtRoomID = parseInt(statsObject.NRROOMS);

                //Setting the new room with one user
                var roomRef = db.ref("/rooms");
                roomRef.child(crtRoomID).set({
                    PLAYER1_ID: key,
                    PLAYER1_STATUS: "waiting",
                    PLAYER1_WINS: "0",
                    PLAYER2_WINS: "0",
                    GAME_ROUNDS: "1",
                    GAME_STATUS: "waitingForPlayers",
                    GAME_MODE: "AI"
                });

                //Setting user roomId
                db.ref("/connectedUsers").child(key).update({
                    "GAME_ROOM": String(crtRoomID)
                });

                //Withdraw QP from players
                addToPlayer(key, "QP", -10);

                //Incrementing stats NR ROOMS number
                db.ref("/stats").update({
                    "NRROOMS": (crtRoomID + 1).toString()
                });

                //Deleting the object
                obj[key] = null;
            }
        }
    }

    return obj;
}


//Make ROOMS
function makeMatching(obj) {
    console.log("makeMatching function called");
    if (obj != null) {
        console.log(JSON.stringify(obj));
        var nrOfQueueUsers = Object.keys(obj).length;
        console.log("Number of queue users: ", nrOfQueueUsers);

        while (nrOfQueueUsers >= 2) {
            var key1 = null,
                key2 = null;

            nrOfQueueUsers = 0;
            for (var key in obj) {
                if (obj[key] == null)
                    continue;

                nrOfQueueUsers++;

                //Choose the two players
                if (key1 == null)
                    key1 = key;
                else {
                    key2 = key;
                    break;
                }
            }

            if (key1 != null && key2 != null) {
                var crtRoomID = parseInt(statsObject.NRROOMS);

                //Setting the new room with two users
                var roomRef = db.ref("/rooms");
                roomRef.child(crtRoomID).set({
                    PLAYER1_ID: key1,
                    PLAYER2_ID: key2,
                    PLAYER1_STATUS: "waiting",
                    PLAYER2_STATUS: "waiting",
                    PLAYER1_WINS: "0",
                    PLAYER2_WINS: "0",
                    GAME_ROUNDS: "1",
                    GAME_STATUS: "waitingForPlayers",
                    GAME_MODE: "twoPlayers"
                });

                //Setting user roomId
                db.ref("/connectedUsers").child(key1).update({
                    "GAME_ROOM": String(crtRoomID)
                });
                db.ref("/connectedUsers").child(key2).update({
                    "GAME_ROOM": String(crtRoomID)
                });

                //Withdraw QP from players
                addToPlayer(key1, "QP", -10);
                addToPlayer(key2, "QP", -10);

                //Deleting selected users from queue
                var deleteRef = db.ref("/queue").child(key1);
                deleteRef.remove();
                obj[key1] = null;
                var deleteRef = db.ref("/queue").child(key2);
                deleteRef.remove();
                obj[key2] = null;


                nrOfQueueUsers -= 2;
                db.ref("/stats").update({
                    "NRROOMS": (crtRoomID + 1).toString()
                });
            }
        }
    }
}

//ROOMS SECTION
var refRooms = db.ref("/rooms");
refRooms.on("value", function(snapshot) {
    console.log("ROOMS Section Updated");
    var obj = snapshot.val();
    if (!waitFindAndComputeRooms) {
        waitFindAndComputeRooms = true;
        findAndComputeRooms(obj);
        waitFindAndComputeRooms = false;
    }


}, function(errorObject) {
    console.log("The read failed: " + errorObject.code);
});

function findAndComputeRooms(obj) {
    for (crt in obj) {
        if( obj[crt].GAME_MODE == "twoPlayers" )
            twoPlayersGameCompute(obj, crt);
        if( obj[crt].GAME_MODE == "AI" )
            AiGameCompute(obj, crt);
    }
}

function AiGameCompute(obj, crt) {
    if(obj[crt].GAME_STATUS == "waitingForPlayers" && obj[crt].PLAYER1_STATUS == 'connected')
        quizzPreparing(obj[crt], crt);
    if(obj[crt].GAME_STATUS == "preparing" && obj[crt].PLAYER1_STATUS == "ready")
        quizzReady(obj[crt], crt);
    if(obj[crt].GAME_STATUS == "running") {
        var userAnswerTime = parseFloat(obj[crt].PLAYER1_TIMER);
        var aiWon = false;
        if(userAnswerTime >= 15.00)
            aiWon = randomFunction(20);
        if(userAnswerTime >= 10.00)
            aiWon = randomFunction(35);
        if(userAnswerTime >= 6.00)
            aiWon = randomFunction(45);
        if(userAnswerTime < 6)
            aiWon = randomFunction(60);

        var winsPlayer1 = parseInt(obj[crt].PLAYER1_WINS);
        var winsPlayer2 = parseInt(obj[crt].PLAYER2_WINS);

        if(aiWon == true)
            winsPlayer2++;
        else
            winsPlayer1++;

        db.ref("/rooms").child(crt).update({
            "PLAYER1_WINS": String(winsPlayer1),
            "PLAYER2_WINS": String(winsPlayer2)
        });

        quizzEndRound(obj, crt, winsPlayer1, winsPlayer2);
    }
}

function twoPlayersGameCompute(obj, crt) {
        //STEP1: WAITING
    if (obj[crt].GAME_STATUS == "waitingForPlayers")
        if (obj[crt].PLAYER1_STATUS == "connected" && obj[crt].PLAYER2_STATUS == "connected") {
            quizzPreparing(obj[crt], crt);
        }

        //STEP1: PREPARING
    if (obj[crt].GAME_STATUS == "preparing")
        if (obj[crt].PLAYER1_STATUS == "ready" && obj[crt].PLAYER2_STATUS == "ready") {
            quizzReady(obj[crt], crt);
        }
        //STEP3: RUNNING
    if (obj[crt].GAME_STATUS == "running") {
        if (obj[crt].PLAYER1_STATUS == "done" && obj[crt].PLAYER2_STATUS == "done") {
            quizzRunning(obj[crt], crt);
        }
    }

    //GAME ABANDON
    if (obj[crt].GAME_STATUS != "finished") {
        if (obj[crt].PLAYER1_STATUS == "exited" || obj[crt].PLAYER2_STATUS == 'exited')
            quizzAbandon(obj[crt], crt);
        //if (typeof usersObject[obj[crt].PLAYER1_ID] === 'undefined' || typeof usersObject[obj[crt].PLAYER1_ID] === 'undefined')
            //break;
        if (parseInt(Date.now()) - parseInt(usersObject[obj[crt].PLAYER1_ID].TIME) >= 8000)
            quizzAbandon(obj[crt], crt);
        if (parseInt(Date.now()) - parseInt(usersObject[obj[crt].PLAYER2_ID].TIME) >= 8000)
            quizzAbandon(obj[crt], crt);
    }

    //MOVE FINISHED ROOMS TO ARCHIVE
    if (obj[crt].GAME_STATUS == "finished" && obj[crt].PLAYER1_STATUS == "exited" && obj[crt].PLAYER2_STATUS == "exited")
        moveToArchivedRooms(obj[crt], crt);
}

function moveToArchivedRooms(obj, id) {
    var newObj = {};
    newObj[id] = obj;
    console.log("######################");
    console.log("moveToARvhicedRooms: " + JSON.stringify(newObj));
    console.log("######################");
    db.ref("/archivedRooms").update(newObj);
    db.ref("/rooms").child(id).remove();
}

function quizzPreparing(obj, id) {
    var keys = Object.keys(quizzesObject);
    var random = Math.floor(Math.random() * keys.length);
    var chosenQuizz = keys[random];
    var gameRounds = parseInt(obj.GAME_ROUNDS)
    console.log("quizzPreparing - room: " + id + " - round: " + gameRounds);

    //RUN THE GAME
    var crtTime = new Date().toLocaleString();
    db.ref("/rooms").child(id).update({
        "GAME_STATUS": "preparing",
        "GAME_QUIZZ": String(chosenQuizz),
        "GAME_ROUNDS": String(gameRounds + 1),
        "GAME_ANSWERLETTERS": quizzesObject[chosenQuizz].ANSWER.length
    });
}

function quizzReady(obj, id) {
    var gameRounds = parseInt(obj.GAME_ROUNDS)
    console.log("quizReady - room: " + id + " - round: " + gameRounds);

    //var crtTime =  new Date().toLocaleString();
    db.ref("/rooms").child(id).update({
        "GAME_STATUS": "running"
    });
}

//COMPUTE RESULTS OF CURRENT OBJECT WITH given ROOM id
function quizzRunning(obj, id) {
    console.log("computeResult: starting");
    var refQuizz = db.ref("/quizzes/" + obj.GAME_QUIZZ);
    //GET QUIZZ ANSWER
    refQuizz.once("value", function(snapshot) {
        var refQuizzObject = snapshot.val();

        var answer = formatString(refQuizzObject.ANSWER);
        var answerPlayer1 = formatString(obj.PLAYER1_RESULT);
        var answerPlayer2 = formatString(obj.PLAYER2_RESULT);
        var timerPlayer1 = parseFloat(obj.PLAYER1_TIMER);
        var timerPlayer2 = parseFloat(obj.PLAYER2_TIMER);
        var winsPlayer1 = parseInt(obj.PLAYER1_WINS);
        var winsPlayer2 = parseInt(obj.PLAYER2_WINS);
        var winnerId = 0;

        //Choose the winner
        if (answerPlayer1 == answerPlayer2 && answerPlayer1 == answer) {
            if (timerPlayer1 > timerPlayer2)
                winnerId = 1;
            else
                winnerId = 2;
        } else {
            if (answerPlayer1 == answer)
                winnerId = 1;

            if (answerPlayer2 == answer)
                winnerId = 2;
        }

        if (winnerId == 1)
            winsPlayer1++;
        else
            winsPlayer2++;

        db.ref("/rooms").child(id).update({
            "PLAYER1_WINS": String(winsPlayer1),
            "PLAYER2_WINS": String(winsPlayer2)
        });

        quizzEndRound(obj, id, winsPlayer1, winsPlayer2);

    }, function(errorObject) {
        console.log("The read failed: " + errorObject.code);
    });
}

function quizzEndRound(obj, id, winsPlayer1, winsPlayer2) {
    var rounds = parseInt(obj.GAME_ROUNDS);
    console.log("quizzEndRound: " + JSON.stringify(obj));

    if (rounds <= 2 || (rounds > 2 && winsPlayer1 == winsPlayer2)) {
        db.ref("/rooms").child(id).update({
            "GAME_STATUS": "waitingForPlayers",
            "PLAYER1_STATUS": "waiting",
            "PLAYER2_STATUS": "waiting"
        });
    } else {
        if (winsPlayer1 > winsPlayer2) {
            db.ref("/rooms").child(id).update({
                "GAME_STATUS": "finished",
                "GAME_WINNER": "PLAYER1"
            });
            addToPlayer(obj.PLAYER1_ID, "QP", 20);
            addToPlayer(obj.PLAYER1_ID, "GAMES_WON", 1);
        } else {
            db.ref("/rooms").child(id).update({
                "GAME_STATUS": "finished",
                "GAME_WINNER": "PLAYER2"
            });
            addToPlayer(obj.PLAYER2_ID, "QP", 20);
            addToPlayer(obj.PLAYER2_ID, "GAMES_WON", 1);
        }
        addToPlayer(obj.PLAYER1_ID, "GAMES_PLAYED", 1);
        addToPlayer(obj.PLAYER2_ID, "GAMES_PLAYED", 1);
    }
}

function quizzAbandon(obj, id) {
    db.ref("/rooms").child(id).update({
        "GAME_STATUS": "finished",
        "GAME_WINNER": "ABANDON"
    });
}

function formatString(str) {
    if (typeof str !== 'undefined')
        return str.toLowerCase().trim().replace(" ", "");
    else
        return "";
}

function addToPlayer(playerId, propriety, value) {
    var refPlayer = db.ref("/connectedUsers/" + playerId);
    refPlayer.once("value", function(snapshot) {
        var obj = snapshot.val();
        var crt = parseInt(obj[propriety]) + value;

        var objNew = {};
        objNew[propriety] = crt.toString();
        db.ref("connectedUsers/").child(playerId).update(objNew);

        console.log(`Added ${value} ${propriety} to player ${playerId}`);
    }, function(errorObject) {
        console.log("The read failed: " + errorObject.code);
    });
}


//QUIZZ SECTION
var refQuizzes = db.ref("/quizzes");
refQuizzes.on("value", function(snapshot) {
    console.log("QUIZZ Section Updated");
    quizzesObject = snapshot.val();
}, function(errorObject) {
    console.log("The read failed: " + errorObject.code);
});

judgePendingQuizz = function(obj) {
    console.log("POST REQUEST: " + JSON.stringify(obj));
    if (pendingQuizzesObject[obj.quizzID]) {
        pendingQuizzesObject[obj.quizzID].ANSWER = obj.quizzAnswer;

        var message = {};

        if (obj.action == "ok") {
            db.ref("quizzes").child(obj.quizzID).update(pendingQuizzesObject[obj.quizzID]);
            var crtUserQp = parseInt(usersObject[obj.quizzBY].QP);
            db.ref("connectedUsers").child(obj.quizzBY).update({"QP" : (crtUserQp +50).toString()});
            console.log(`Pending quizz with id ${obj.quizzID} was added to quizzes. Player ${obj.quizzBY} rewarded with 50 QP`);

            //Send Notification to user
            message = {
                to: usersObject[obj.quizzBY].TOKEN,
                collapse_key: 'quizAddNotify',
                data: {
                    your_custom_data_key: 'your_custom_data_value'
                },
                notification: {
                    title: 'Quiz Accepted',
                    body: '+50QP added to your account'
                }
            };
        } else {
            console.log(`Pending quizz with id ${obj.quizzID} was erased`);

            //Send Notification to user
            message = {
                to: usersObject[obj.quizzBY].TOKEN,
                collapse_key: 'quizAddNotify',
                data: {
                    your_custom_data_key: 'your_custom_data_value'
                },
                notification: {
                    title: 'Quiz Denied',
                    body: 'Check guide section for more information'
                }
            };
        }

        fcm.send(message, function(err, response){
            if (err) {
                console.log("Something has gone wrong!");
            } else {
                console.log("Successfully sent with response: ", response);
            }
        });

        db.ref("/pendingQuizzes").child(obj.quizzID).remove();
    }
}

//PENDING QUIZZ SECTION
var refPendingQuizzes = db.ref("/").child('pendingQuizzes');
refPendingQuizzes.on("value", function(snapshot) {
    console.log("pendingQUIZZ Section Updated");
    pendingQuizzesObject = snapshot.val();
}, function(errorObject) {
    console.log("The read failed: " + errorObject.code);
});

//STATS SECTION
var refStats = db.ref("/stats");
refStats.on("value", function(snapshot) {
    console.log("STATS Section Updated");
    statsObject = snapshot.val();
}, function(errorObject) {
    console.log("The read failed: " + errorObject.code);
});

function randomFunction(chance) {
    return (Math.floor(Math.random() * 100) + 1) >= chance ;
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

app.listen(3001);
module.exports = app;
