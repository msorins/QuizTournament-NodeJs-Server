var express = require('express');
var router = express.Router();
const fs = require('fs');


/* GET users listing. */
router.get('/', function(req, res, next) {
  res.render('importQuizzes', { title: 'Express' });
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

var auxNRQUIZZES;

//Main upload logics
function sendUploadToGCS (req, res, next) {
  if (!req.files) {
    return next();
  }

  auxNRQUIZZES = parseInt(statsObject.NRQUIZZES);

  //Take every file and upload it
  for (i in req.files) {
     auxNRQUIZZES++;

     //STORAGE UPLOAD SECTION
     gcsname = "imgQuizzes" + "/" + auxNRQUIZZES;
     file = bucket.file(gcsname);

     stream = file.createWriteStream({
         metadata:{
             contentType: req.files[i].mimetype
         }
     });

     stream.on('error', function (err) {
       req.files[i].cloudStorageError = err;
       next(err);
     });

     stream.on('finish', function () {
        next();
     });

     stream.end(req.files[i].buffer);

     //DATABASE UPLOAD SECTION

     //Regex to allow custom name formats
     var regexNumberedWithDash = new RegExp("^[\d]+-[a-z]+.[a-z]+$");
     var regexSimple = new RegExp("^[a-z|A-Z]+.[a-z]+$");

     var originalName = req.files[i].originalname.toString();
     var answer = '';

     //Form: 01-cola.jpg
     if(regexNumberedWithDash.test(originalName)) {
         var ok = false;
         for(var j = 0; j<originalName.length; j++) {
             if(originalName[j] == '-'){
                 ok = true;
                 continue;
             }

             if(originalName[j] == '.')
                break;

            if(ok)
              answer += originalName[j];
         }
     }

     //Form: cola.jpg
    if(regexSimple.test(originalName)) {
        for(var j = 0; j<originalName.length; j++) {
            if(originalName[j] == '.')
                break;

            answer += originalName[j];
        }
    }

     //Actually upload part
     newQuizObj = {};
     newQuizObj.ANSWER =  answer;
     newQuizObj.URL = getPublicUrl(gcsname);
     newQuizObj.BY = "admin";
     newQuizObj.CATEGORY = req.body.quizCategory;

     db.ref("/quizzes").child(auxNRQUIZZES).update(newQuizObj);
  }

  stream.end();

}

router.post('/', multer.any('quizImg'), sendUploadToGCS,  function insert (req, res, next) {
    //Update the statistics & Redirect user back to the form
    db.ref("/stats").update({"NRQUIZZES": (parseFloat(auxNRQUIZZES).toString())});
    res.redirect('/import');
  });

module.exports = router;
