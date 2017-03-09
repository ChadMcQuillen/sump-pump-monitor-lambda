'use strict';

var AWS = require("aws-sdk");
var moment = require("moment");

var docClient = new AWS.DynamoDB.DocumentClient();

var currentEvent;

function sendSNS(message) {
    var sns = new AWS.SNS();
    var params = {
        Message : message, 
        Subject : 'Sump Pump Water Level Change',
        TopicArn : process.env.SUMP_PUMP_ALERTS_TOPIC
    };
    sns.publish(params, function(err, data) {
        if (err) {
            console.error("Unable to publish message to SNS. Error JSON:", JSON.stringify(err, null, 2));
        }
    });    
}

function refreshSumpPumpAlertTimestamp(data) {
    var params = {
        TableName : process.env.SUMP_PUMP_ALERTS_TABLE,
        Key : {
            'sump-pump' : data['sump-pump'],
            'timestamp-initial' : data['timestamp-initial']
        },
        UpdateExpression : 'set #tsl = :tsl',
        ExpressionAttributeNames : {
            '#tsl' : 'timestamp-latest'
        },
        ExpressionAttributeValues : {
            ':tsl' : currentEvent['timestamp']
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

function newSumpPumpAlert(alert) {
    var params = {
        TableName : process.env.SUMP_PUMP_ALERTS_TABLE,
        Item : alert
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
    var currentLevel;
    var alert;
    console.log(data);
    if (err) {
        console.error("Unable to query latest sump pump alert. Error:", JSON.stringify(err, null, 2));
    } else if (data.Items.length == 0) {
        // cold start - seed table with initial 'alert'
        currentLevel = parseFloat(currentEvent['water-level'] / 60);
        alert = {
            'sump-pump' : currentEvent['sump-pump'],
            'timestamp-initial' : currentEvent['timestamp'],
            'timestamp-latest' : currentEvent['timestamp'],
            'greater-than-level' : Math.floor(currentLevel * 10) / 10
        };
        newSumpPumpAlert(alert);
    } else {
        currentLevel = parseFloat(currentEvent['water-level'] / 60);
        var savedLevel = parseFloat(data.Items[0]['greater-than-level']);
        if (currentLevel > parseFloat((savedLevel + .1))) {
            // transition to next level - send alert
            alert = {
                'sump-pump' : currentEvent['sump-pump'],
                'timestamp-initial' : currentEvent['timestamp'],
                'timestamp-latest' : currentEvent['timestamp'],
                'greater-than-level' : Math.floor(currentLevel * 10) / 10
            };
            newSumpPumpAlert(alert);
            sendSNS('Sump pump water level has exceeded ' + alert['greater-than-level'] + '%.');
        } else if (currentLevel > savedLevel) {
            // refresh timestamp for this level
            refreshSumpPumpAlertTimestamp(data.Items[0]);
        } else {
            // check to see if it is time to downgrade level
            var now = moment(currentEvent['timestamp']);
            var then = moment(data.Items[0]['timestamp-latest']);
            var hoursSinceLevel = parseFloat(moment.duration(now.diff(then)).asHours());
            if (hoursSinceLevel > 1) {
                alert = {
                    'sump-pump' : currentEvent['sump-pump'],
                    'timestamp-initial' : data.Items[0]['timestamp-latest'],
                    'timestamp-latest' : currentEvent['timestamp'],
                    'greater-than-level' : Math.floor(currentLevel * 10) / 10
                };
                newSumpPumpAlert(alert);
                sendSNS('Sump pump water level has dropped below ' + alert['greater-than-level'] + '%.');
            } else {
                console.log('hours elapsed:  ' + hoursSinceLevel);
            }
        }
    }
}

function queryLatestSumpPumpAlert() {
    var params = {
        TableName : process.env.SUMP_PUMP_ALERTS_TABLE,
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
        'TableName' : process.env.SUMP_PUMP_WATER_LEVEL_TABLE,
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
