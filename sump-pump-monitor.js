'use strict';

const TABLE_NAME = 'sump-pump-alerts';

var AWS = require("aws-sdk");
var moment = require("moment");

var docClient = new AWS.DynamoDB.DocumentClient();

var currentEvent;

function sendSNS(message) {
    var sns = new AWS.SNS();
    var params = {
        Message : message, 
        Subject : 'Sump Pump Water Level Change',
        TopicArn : 'arn:aws:sns:us-east-1:217282925988:sump-pump-alerts'
    };
    sns.publish(params, function(err, data) {
        if (err) {
            console.error("Unable to publish message to SNS. Error JSON:", JSON.stringify(err, null, 2));
        }
    });    
}

function refreshSumpPumpAlertTimestamp(data) {
    var params = {
        TableName : TABLE_NAME,
        Key : {
            'sump-pump' : data['sump-pump'],
            'timestamp-initial' : data['timestamp-initial']
        },
        UpdateExpression : 'set #tsl = :tsl',
        ExpressionAttributeNames : {
            '#tsl' : 'timestamp-latest'
        },
        ExpressionAttributeValues : {
            ':tsl' : moment.utc().format()
        },
        ReturnValues : "UPDATED_NEW"
    };

    docClient.update(params, function(err, data) {
        if (err) {
            console.error("Unable to update sump pump alert timestamp. Error JSON:", JSON.stringify(err, null, 2));
        } else {
            console.log("Refereshed sump pump alert timestamp:", JSON.stringify(data, null, 2));
        }
    });
}

function newSumpPumpAlert(level, initialTime) {
    initialTime = initialTime || moment.utc().format();
    var now = moment.utc().format();
    var params = {
        TableName : TABLE_NAME,
        Item : {
            'sump-pump' : 'primary',
            'timestamp-initial' : initialTime,
            'greater-than-level' : level,
            'timestamp-latest' : now
        }
    };

    docClient.put(params, function(err, data) {
        if (err) {
            console.error("Unable to write new sump pump alert. Error JSON:", JSON.stringify(err, null, 2));
        } else {
            console.log("Wrote new sump pump alert:", JSON.stringify(data, null, 2));
        }
    });
}

function onQueryLatestSumpPumpAlert(err, data) {
    if (err) {
        console.error("Unable to query latest sump pump alert. Error:", JSON.stringify(err, null, 2));
    } else {
        var currentLevel = parseFloat(currentEvent['water-level'] / 60);
        var savedLevel = parseFloat(data.Items[0]['greater-than-level']);
        var newLevel;
        if (currentLevel > parseFloat((savedLevel + .1))) {
            // transition to next level - send alert
            newLevel = Math.floor(currentLevel * 10) / 10;
            newSumpPumpAlert(newLevel);
            sendSNS('Sump pump water level has exceeded ' + newLevel + '%.');
        } else if (currentLevel > savedLevel) {
            // refresh timestamp for this level
            refreshSumpPumpAlertTimestamp(data.Items[0]);
        } else {
            // check to see if it is time to downgrade level
            var now = moment();
            var then = moment(data.Items[0]['timestamp-latest']);
            var hoursSinceLevel = parseFloat(moment.duration(now.diff(then)).asHours());
            if (hoursSinceLevel > 1) {
                newLevel = Math.floor(currentLevel * 10) / 10;
                newSumpPumpAlert(newLevel, data.Items[0]['timestamp-initial']);
                sendSNS('Sump pump water level has dropped below ' + newLevel + '%.');
            }
        }
    }
}

function queryLatestSumpPumpAlert() {
    var params = {
        TableName : TABLE_NAME,
        ProjectionExpression : '#sp, #tsi, #tsl, #gtl',
        KeyConditionExpression : '#sp = :sp',
        ExpressionAttributeNames : {
            '#sp' : 'sump-pump',
            '#tsi' : 'timestamp-initial',
            '#tsl' : 'timestamp-latest',
            '#gtl' : 'greater-than-level'
        },
        ExpressionAttributeValues : {
            ':sp' : 'primary'
        },
        ScanIndexForward : false,
        Limit : 1
    };

    docClient.query(params, onQueryLatestSumpPumpAlert);
}

/**
 * Lambda entry point.
 * @param {Object} event - Sump pump water level data point.
 * @param {string} event.sump-pump - The name of the sump pump being monitored.
 * @param {string} event.timestamp - The timestamp (UTC) of the collected data point.
 * @param {string} event.water-level - The height (cm) of the water level for the sump pump. 
 */
exports.handler = (event, context, callback) => {
    var params = {
        'TableName' : 'sump-pump-water-level',
        'Item' : event
    };
    docClient.put(params, function(err, data) {
        if (err) {
            console.error("Unable to write sump pump data. Error JSON:", JSON.stringify(err, null, 2));
        } else {
            console.log("Wrote new sump pump data:", JSON.stringify(data, null, 2));
        }
    });
    currentEvent = event;
    queryLatestSumpPumpAlert();
};
