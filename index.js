
console.log('get gpio');
const Gpio = require('pigpio').Gpio;

console.log('open gpio');
const motor = new Gpio(26, {mode: Gpio.OUTPUT});

let pulseWidth = 1000;
let increment = 1;

console.log('start servo');

setInterval(() => 
{
    motor.servoWrite(pulseWidth);
    
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
}, 1);

console.log(process);


// process handling

process.on('SIGTERM', () =>
{
    console.log('received SIGTERM');
});

process.on('exit', (code) => 
{
    console.log(`About to exit with code: ${code}`);
});
  