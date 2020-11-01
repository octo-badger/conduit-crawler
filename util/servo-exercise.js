


console.log('get gpio');
const pigpio = require('pigpio');
const Gpio = pigpio.Gpio;

console.log('open gpio');
const motor = new Gpio(26, {mode: Gpio.OUTPUT});

console.log('require intervalz');
const intervals = require('../lib/intervalz');


let servoDelta = 1;
//let upper = 2350;
let upper = 2100;
let lower = 600;
let pulseWidth = Math.round(lower + ((upper - lower) / 2));
let lastServoValue = pulseWidth;

console.log(`start servo (pulseWidth: ${pulseWidth})`);


//let servoToken = setInterval(() => 
intervals.add(() =>
{
    pulseWidth += servoDelta;

    if(pulseWidth < lower || pulseWidth > upper)
    {
        console.log(`switching at: ${pulseWidth}`);
        servoDelta *= -1;
    }

    pulseWidth = Math.max(lower, pulseWidth);
    pulseWidth = Math.min(upper, pulseWidth);

    if(pulseWidth > lower && pulseWidth < upper)
    {
        motor.servoWrite(pulseWidth);
    }
}, 
10);


// let intervalToken = setInterval(() => 
intervals.add(() =>
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
    /*
    clearInterval(servoToken);
    clearInterval(intervalToken);
    /*/
    intervals.clearAll(); 
    //*/
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
  
