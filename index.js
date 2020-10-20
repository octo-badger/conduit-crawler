
console.log('get gpio');
const pigpio = require('pigpio');
const Gpio = pigpio.Gpio;

console.log('open gpio');
const motor = new Gpio(26, {mode: Gpio.OUTPUT});

// --- 'button' setup ----------------------

const buttonSettings = {
    mode: Gpio.INPUT,
    pullUpDown: Gpio.PUD_DOWN,
    alert: true
  };

const buttonDown = new Gpio(20, buttonSettings);
const buttonUp = new Gpio(21, buttonSettings);

var servoDelta = 0;

buttonDown.glitchFilter(10000);                                                     // level must be stable for 10 ms before an alert event is emitted.
buttonUp.glitchFilter(10000);                                                     // level must be stable for 10 ms before an alert event is emitted.

buttonDown.on('alert', (level) => 
{
    servoDelta = level * -1;
});
buttonUp.on('alert', (level) => 
{
    servoDelta = level;
});

// --- end 'button' setup ------------------

let pulseWidth = 1000;
//let increment = 1;

console.log('start servo');

let servoToken = setInterval(() => 
{
    motor.servoWrite(pulseWidth);
    
    /*
    pulseWidth += increment;
    
    if (pulseWidth >= 2300) 
    {
        increment = -1;
    } 
    else if (pulseWidth <= 700) 
    {
        console.log('switch low:');
        increment = 1;
    }
    /*/
    let upper = 2250;
    let mid = 1200;
    let lower = 750;

    pulseWidth += servoDelta;

    if (pulseWidth > mid && pulseWidth < upper) 
    {
        pulseWidth = lower;
    } 
    else if (pulseWidth < mid && pulseWidth > lower) 
    {
        pulseWidth = upper;
    }

    pulsewidth = Math.max(500, pulseWidth);
    pulsewidth = Math.min(2500, pulseWidth);
    //*/
}, 10);

let lastServoValue = pulseWidth;

let intervalToken = setInterval(() => 
{
    if(pulseWidth != lastServoValue)
    {
        console.log(`pulseWidth: ${pulseWidth}`);
    }
    lastServoValue = pulseWidth;
}, 200);


//console.log(process);


// --- process handling ----------------------------------------------------------------

process.on('SIGINT', () => 
{
    motor.servoWrite(0);
    clearInterval(servoToken);
    clearInterval(intervalToken);
});

process.on('SIGTERM', () =>
{
    console.log('received SIGTERM');
});

process.on('exit', (code) => 
{
    pigpio.terminate();
    console.log(`\nExiting with code: ${code}`);
});
  