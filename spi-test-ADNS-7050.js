
let log = (msg, err) => 
{
    if (err) {
        console.error(err);
    }
    console.log(msg);
}

this.config = 
{
    spiDevice: "/dev/spidev0.0"
};

const msb = 0x80;                                                                       // most significant bit (writes have msb set to 1 to denote direction - reads have msb == 0) 


let registers =
{
    Motion: 0x02,
    x28: 0x28,
    POWER_UP_RESET: 0x3a
}


let payload = 
{
    POWER_UP_RESET: new Buffer.from([msb | registers.POWER_UP_RESET, 0x5a]),            // Write 0x5a to register 0x3a 
    POWER_28_FE: new Buffer.from([msb | registers.x28, 0xfe])                           // weird one - this is apparently required in the power-up sequence but register 0x28 is in a range of 'reserved' registers - no idea what this does basically
}

let pins = 
{
    chipSelect: 8
}


// --- initialisation -------------------------------------------------

var piSpi = require("pi-spi");
const Gpio = require('pigpio').Gpio;

log('init spi device');
var spi = piSpi.initialize(this.config.spiDevice);                                      // initialise an spi device
//spi.clockSpeed(1e6);									                                // 1Mhz (one tick every micro-second)
spi.clockSpeed(0x0001ffff);									                            // 131071 Khz (one tick just over every 7.6 micro-seconds - min timings suggest to me that clocking down may eliminate the need for delays waiting for the chip to ready data (way simpler than delaying between operations))
//spi.clockSpeed(0xffff);									                            // 65.535 Khz (one tick just over every 15 micro-seconds)

log('open gpio');
const chipSelect = new Gpio(pins.chipSelect, {mode: Gpio.OUTPUT});


// --- end initialisation ---------------------------------------------

/*
The ADNS-7050 does not perform an internal power up
self-reset; the POWER_UP_RESET register must be written
every time power is applied. The appropriate sequence is
as follows:
1. Apply power
*/

// 2. Drive NCS high, then low to reset the SPI port
chipSelect.digitalWrite(1);
// delay?
chipSelect.digitalWrite(0);

// 3. Write 0x5a to register 0x3a
spi.write(payload.POWER_UP_RESET, (err) =>
{
    log('written POWER_UP_RESET', err);
})


// 4. Wait for tWAKEUP (23 ms)
setTimeout(() => {
    // 5. Write 0xFE to register 0x28
  
    spi.write(payload.POWER_28_FE, (err) =>
    {
        log('written POWER_28_FE', err);
    })  
}, 23);


/*
6. Read from registers 0x02, 0x03, and 0x04 (or read
these same 3 bytes from burst motion register 0x42)
one time regardless of the motion pin state.
*/




