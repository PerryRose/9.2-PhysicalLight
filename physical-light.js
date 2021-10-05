const mqtt = require('mqtt');
const axios = require('axios');
const client = mqtt.connect("mqtt://wbe99751.ap-southeast-1.emqx.cloud:15724", {
    username: 'perryrose',
    password: 'XyK9x8imaeU6dp2'
});
const prompt = require('prompt-sync')({sigint: true});

// Arduino Variables
const five = require("johnny-five");
const board = new five.Board();

const baseTopic = '/sit-314-task92';
let outgoingTopic;
let lightReady = false;
let lightOn = false;
let light;
let roomId;
let currentBrightness = 0;

let email;
let password;
let accessToken;

function setUp() {
    // Get Id of the Light we want to represent with the physical switch & light
    lightId = promptUserForLightId();

    // Set Outgoing Topic
    outgoingTopic = baseTopic + '/from/' + lightId;

    // Subscribe to incoming topics
    client.subscribe(baseTopic + '/to/' + lightId + '/#');

    // Tell control server about this light Id
    client.publish(outgoingTopic + '/get-physical-light', lightId);

}

client.on('message', (topic, message) => {
    //console.log(`[Incoming]: Topic: ${topic} - Message: ${message}`);

    // Check if Light is ready
    if (topic.includes('light-ready')) {
        // Convert message to object
        const messageObj = JSON.parse(message);

        // If Light is good to go
        if (messageObj.ready === true) {
            // Get values
            const state = messageObj.state;
            roomId = messageObj.roomId;

            // Set state
            if (state === 'On') {
                lightOn = true;
                light.on();
            }
            else {
                lightOn = false;
                light.off();
            }

            // Light is ready
            lightReady = true;

            console.log('\n[Light is ready]: State: ' + state + ', Room Id: ' + roomId + '\n');
        }
        else {
            // Error
            console.error('[#] Error verifying light with REST API');
        }
    }
    // Listen for state changes from Control Server
    else if (topic.includes('update-state')) {
        // Get new state
        const newState = message;

        // Set state
        if (newState == 'On') {
            console.log('[#] Control Server says turn on');
            lightOn = true;
            light.on();
        }
        else {
            console.log('[#] Control Server says turn off');
            lightOn = false;
            light.off();
        }
    }
    // Listen for brightness changes from Control Server
    else if (topic.includes('update-brightness')) {
        // Get new brightness
        const newBrightness = Number(message);

        const brightnessForLED = Math.floor((((newBrightness) * 255) / 100));

        console.log(`[#] Control Server says change brightness to ${newBrightness}% (${brightnessForLED})`);

        light.brightness(brightnessForLED);
    }

});

function promptUserForLightId() {
    console.log('\nSelect a Light Id\n')

    let input = prompt(`Light ID: `);

    // Validate input
    if (input >= 0) {
        return input;
    }
    else {
        console.log('\n[Error]: Invalid light ID \n')
        return promptUser();
    }
}

// When Arduino is ready
board.on("ready", async function() {
    console.log("[#] Board ready");

    setUp();

    // Get light
    light = new five.Led(6);

    // Get access to light instance
    board.repl.inject({ led: light });

    // Button
    const button = new five.Button(4);

    // Get access to Button instance
    board.repl.inject({ button: button });

    // Button Pressed
    button.on("down", function() {
        // If Light is ready
        if (lightReady) {
            // Toggle Light
            if (lightOn) {
                lightOn = false;
                light.off();
                publishChange('state', 'Off');
            }
            else {
                lightOn = true;
                light.on();
                publishChange('state', 'On');
            }
        }
    });

    // Get Rotary Potentiometer
    let rotaryPotentiometer = new five.Sensor("A0");

    // Rotary Changed
    rotaryPotentiometer.on("change", function() {
        // My Rotary Pontentiometer stopped working properly
        // This is a horrible fix but it works
        if (lightReady) {
            let newBrightnessForDB = 100 - Math.floor((((this.value - 0) * 100) / 678) + 0);

            // Only update when rotary value has actually changed
            if (newBrightnessForDB != currentBrightness) {
                let newBrightnessForPhysicalLED = 255 - Math.floor((((this.value - 0) * 255) / 678) + 0);

                if (lightOn) {
                    // Set LED Brightness
                    light.brightness(newBrightnessForPhysicalLED);
                }

                currentBrightness = newBrightnessForDB;

                publishChange('brightness', Number(newBrightnessForDB));
            }
        }
    });
});

function publishChange(input, state) {
    client.publish(outgoingTopic + '/roomId/' + roomId + '/' + input, String(state));
}
