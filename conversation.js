var mongoose = require('mongoose')
, Schema = mongoose.Schema;
var wait = require('wait.for');

var heuristicList = ["FIFO", "LIFO", "Random", "ChatLengthHiLo", 
"ChatLengthHiHi", "LastVisitHiLo", "LastVisitHiHi", "ClickProbHiLo", 
"ClickProbHiHi", "MatchProbHiLo", "MatchProbHiHi"];

/******************************************************************************
* Initialize mongoDB database schema and model
******************************************************************************/

// Build new schema for database entry
var conversationSchema = new Schema({
  userID1: String, 
  userID2: String, 
  matchingHeuristic: String, 
  chatLength: Number, 
  startTime: Date, 
  user1Clicked: Boolean, 
  user2Clicked: Boolean
});

// Compile schema into mongoDB model object, which can be used to manipulate 
// the set of Conversation documents below.
var Conversation = mongoose.model('Conversation', conversationSchema);

/******************************************************************************
* Implement public functions, visible to all clients using the conversation.js
* module.
******************************************************************************/

 // Check to see if the current conversation is already in the database. 
 // If it is, ignore it, otherwise create a new entry and add it to the 
 // database. 
 exports.save = function(user) {
   Conversation.find()
   .or([{userID1: user.ownID, userID2: user.partnerID, startTime: user.startTime},
    {userID1: user.partnerID, userID2: user.ownID, startTime: user.startTime}])
   .exec(function(err, convo) {
    if (err) {
      console.log("Error reading from the database!");
    } else {
      if (convo.length == 0) {
        new Conversation({
          userID1: user.ownID, 
          userID2: user.partnerID, 
          matchingHeuristic: user.matchingHeuristic, 
          chatLength: Date.now() - user.startTime, 
          startTime: user.startTime, 
          user1Clicked: user.ownClick,
          user2Clicked: user.partnerClick
        }).save();
      }
    }
  });
 }

 // Given a current user and a queue of potential matches, implement
 // the UCB1 algorithm with a pre-defined set of heuristics as the 
 // bandit-arms. See write-up for more details.
 exports.pickPartner = function (user, queue) {

  // pick matching heuristic
  // use UCB algorithm to pick the correct heuristic
  // for each matching heuristic, calculate UCB value and 
  // find the maximum value

  // FIXME: PLAY EACH ARM ONCE TO INITIALIZE

  var currentValue = null;
  var currentMax = 0;
  var currentBestHeuristic = null;

  for (var i = 0; i < heuristicList.length; i++) {
    var currentValue = findHeuristicAndExecute(heuristicList[i], UCBMatchProb);
  }
  // calculate average success rate
  // end up with the chosenHeuristic
  // FIXME

  var chosenHeuristic = "FIFO";
  var partner = null;

  // implement the matching heuristic chosen 
  switch(chosenHeuristic)
  {
    case "FIFO": 
    partner = FIFO(user, queue);
    break;
    case "LIFO":
    partner = LIFO(user, queue);
    break;
    case "Random":
    partner = Random(user, queue);
    break;
    case "ChatLengthHiLo": 
    partner = findPartnerWithMaxDistance(user, queue, averageChatLength);
    break;
    case "ChatLengthHiHi": 
    partner = findPartnerWithMinDistance(user, queue, averageChatLength);
    break;
    case "LastVisitHiLo":
    partner = findPartnerWithMaxDistance(user, queue, averageLastVisit);
    break;
    case "LastVisitHiHi":
    partner = findPartnerWithMinDistance(user, queue, averageLastVisit);
    break;
    case "ClickProbHiLo":
    partner = findPartnerWithMaxDistance(user, queue, averageClickProb);
    break;
    case "ClickProbHiHi":
    partner = findPartnerWithMinDistance(user, queue, averageClickProb);
    break;
    case "MatchProbHiLo":
    partner = findPartnerWithMaxDistance(user, queue, averageMatchProb);
    break;
    case "MatchProbHiHi":
    partner = findPartnerWithMinDistance(user, queue, averageMatchProb);
    break;
  }

  // Update field of both user and partner with the matching heuristic
  user.matchingHeuristic = chosenHeuristic;
  partner.matchingHeuristic = chosenHeuristic;
  return partner;

}

/******************************************************************************
* Implement matching heuristic helper functions
******************************************************************************/

// This function returns the first element of the queue 
// (i.e. First In First Out, or the least recently added)
var FIFO = function(user, queue) {
  return queue.shift();
}

// This function returns the last element of the queue
// (i.e. Last In First Out, or the most recently added)
var LIFO = function(user, queue) {
  return queue.pop();
}

// This function returns a random element of the queue
var Random = function(user, queue) {
  var randomIndex = Math.floor(Math.random()*queue.length);
  return queue.splice(randomIndex, 1);
}

// This function finds the potential partner in queue that 
// has the minimum distance to user with respect to the normFunction.
// FIXME: ADD REQUIRED FUNCTION SIGNATURE FOR NORM FUNCTION
var findPartnerWithMinDistance = function(user, queue, normFunction) {

  // compute average chat length for current user
  var userValue = findUserAndExecute(user, normFunction);

  // initialize running min variables
  var bestDistance = Number.POSITIVE_INFINITY;
  var bestMatch = null;

  for (var i = 0; i < queue.length; i++) {
    var currentAvg = findUserAndExecute(queue[i], normFunction);
    var currentDist = Math.abs(currentAvg - userAverage);
    if (currentDist <= bestDistance) {
      bestMatch = queue[i];
      bestDistance = currentDist;
    }
  }

  return bestMatch;
}

// This function finds the potential partner in queue that 
// has the maximum distance to user with respect to the normFunction.
// FIXME: ADD REQUIRED FUNCTION SIGNATURE FOR NORM FUNCTION
var findPartnerWithMaxDistance = function(user, queue, normFunction) {

  // compute average chat length for current user
  var userAverage = findUserAndExecute(user, normFunction);

  // initialize running max variables
  var bestDistance = 0;
  var bestMatch = null;

  for (var i = 0; i < queue.length; i++) {
    var currentAvg = findUserAndExecute(queue[i], normFunction);
    var currentDist = Math.abs(currentAvg - userAverage);
    if (currentDist >= bestDistance) {
      bestMatch = queue[i];
      bestDistance = currentDist;
    }
  }

  return bestMatch;
}

// FIXME: THESE TWO HELPER FUNCTION COMMENTS
// This function executes the function to execute a function over the array 
// conversations belonging to a particular user and return 
// the result
var findUserAndExecute = function(user, functionToApply) {
 var query = {$or: [{userID1: user.ownID}, {userID2: user.ownID}]};
 try {
   var data = wait.forMethod(Conversation, "find", query);
   return functionToApply(user, data);
 }
 catch(err) {
  console.log("Error reading from the database!");
}
}

// helper function to execute a function over the array 
// conversations using a particular matching heuristics 
// and return the result
// FIXME: functionToApply signature add
var findHeuristicAndExecute = function(heuristic, functionToApply) {
  var query = {matchingHeuristic: heuristic};
  try {
    var data = wait.forMethod(Conversation, "find", query);
    return functionToApply(data);
  }
  catch(err) {
    console.log("Error reading from the database!");
  }
}

/******************************************************************************
* Implement norm functions
******************************************************************************/

var averageChatLength = function(user, convoArray) {

  var sum = 0.0;
  var length = convoArray.length;
  for (var i = 0; i < length; i++) {
    sum = sum + convoArray[i].chatLength;
    length++;
  }
  if (length > 0) return sum/length;
  else return 0;    
}

var averageLastVisit = function(user, convoArray) {

  var sum = 0.0;
  var length = convoArray.length;
  for (var i = 0; i < length; i++) {
    sum = sum + Date.parse(convoArray[i].startTime);
  }
  if (length > 0) return Date.now() - (sum/length);
  else return Math.POSITIVE_INFINITY;

}

var averageMatchProb = function(user, convoArray) {

  var sum = 0.0;
  var length = convoArray.length;
  for (var i = 0; i < length; i++) {
    if (convoArray[i].user1Clicked && convoArray[i].user2Clicked) sum++;
  }
  if (length > 0) return sum/length;
  else return 0;

}

var averageClickProb = function(user, convoArray) {

  var sum = 0.0;
  var length = convoArray.length;
  for (var i = 0; i < length; i++) {
    if (user.ownID === convoArray[i].userID1 && convoArray[i].user1Clicked) sum++;
    if (user.ownID === convoArray[i].userID2 && convoArray[i].user2Clicked) sum++;
  }
  if (length > 0) return sum/length;
  else return 0;

}

var UCBMatchProb = function(convoArray) {

  var sum = 0.0; 
  var length = convoArray.length;
  for (var i = 0; i < length; i++) {
    if (convoArray[i].user1Clicked && convoArray[i].user2Clicked) sum++;
  }

  if (length > 0) return ((sum/length) + Math.sqrt(2*Math.log(sum)/length));
  else return 0;

}

/******************************************************************************
* Debugging functions
******************************************************************************/

// This function prints all the conversations in the database.
exports.displayAll = function() {
  Conversation.find(function(err, convo) {
    if (err) {
      console.log("Error printing the conversation!");
    } else {
      console.log(convo);
    }
  })
}
