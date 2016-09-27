var express = require('express');
var router = express.Router();
const fs = require('fs');


/* GET users listing. */
router.get('/', function(req, res, next) {
  res.render('addquiz', { title: 'Express' });
});

// POST - UPLOAD IMAGE TO FIREBASE STORAGE

var multer = require('multer')({
  inMemory: true,
  fileSize: 5 * 1024 * 1024, // no larger than 5mb
  rename: function (fieldname, filename) {
    // generate a unique filename
    return filename.replace(/\W+/g, '-').toLowerCase() + Date.now();
  }
});

function getPublicUrl (filename) {
  var aux = filename.split("/");
  return "https://firebasestorage.googleapis.com/v0/b/logoquizz-tournament.appspot.com/o/imgQuizzes%2F"+ aux[1] +"?alt=media";
}

function sendUploadToGCS (req, res, next) {
  if (!req.file) {
    return next();
  }

  var gcsname = "imgQuizzes" + "/" + parseFloat(statsObject.NRQUIZZES);
  var file = bucket.file(gcsname);
  var stream = file.createWriteStream({
      metadata:{
          contentType: req.file.mimetype
      }
  });

  stream.on('error', function (err) {
    req.file.cloudStorageError = err;
    next(err);
  });

  stream.on('finish', function () {
    req.file.cloudStorageObject = gcsname;
     req.file.cloudStoragePublicUrl = getPublicUrl(gcsname);
    next();
  });

  stream.end(req.file.buffer);
}


router.post('/', multer.single('quizImg'), sendUploadToGCS,  function insert (req, res, next) {
    if (req.file && req.file.cloudStoragePublicUrl) {
        var newQuizObj = {};
        newQuizObj.ANSWER =  req.body.quizzAnswer;
        newQuizObj.URL = req.file.cloudStoragePublicUrl;
        db.ref("/quizzes").child(statsObject.NRQUIZZES).update(newQuizObj);
        db.ref("/stats").update({"NRQUIZZES": (parseFloat(statsObject.NRQUIZZES) + 1).toString()});
    }


  });

module.exports = router;
