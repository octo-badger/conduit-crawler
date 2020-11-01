
console.log('get gpio');
const pigpio = require('pigpio');
const Gpio = pigpio.Gpio;

console.log('open gpio');
const motor = new Gpio(26, {mode: Gpio.OUTPUT});

console.log('require intervalz');
const intervals = require('../lib/intervalz');

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

function go()
{

    let upper = 2385;
    let lower = 600;
    let pulseWidth = Math.round(lower + ((upper - lower) / 2));
    let lastServoValue = pulseWidth;

    console.log(`start servo (pulseWidth: ${pulseWidth})`);


    //let servoToken = setInterval(() => 
    intervals.add(() => 
    {
        pulseWidth += servoDelta;

        pulseWidth = Math.max(lower, pulseWidth);
        pulseWidth = Math.min(upper, pulseWidth);

        if(pulseWidth > lower && pulseWidth < upper)
        {
            motor.servoWrite(pulseWidth);
        }
    }, 
    10);


    //let intervalToken = setInterval(() => 
    intervals.add(() => 
    {
        if(pulseWidth != lastServoValue)
        {
            console.log(`pulseWidth: ${pulseWidth}`);
        }
        lastServoValue = pulseWidth;
    }, 200);

}


// --- process handling ----------------------------------------------------------------

process.on('SIGINT', () => 
{
    console.log('received SIGINT');
    motor.servoWrite(0);
    /*
    clearInterval(servoToken);
    clearInterval(intervalToken);
    /*/
    intervals.clearAll();
    //*/
    process.exit();
});

process.on('SIGTERM', () =>
{
    console.log('received SIGTERM');
});

process.on('exit', (code) => 
{
    console.log('received exit');
    pigpio.terminate();
    console.log(`\nExiting with code: ${code}`);
});
  

//console.log(process);
console.log('attached to process events');

try
{
    go();
}
catch(e)
{
    console.error(e);
}