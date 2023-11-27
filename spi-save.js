/**
 * Attempts to communicate with the ADNS-7050 Laser Mouse Sensor.
 * Dumps written and read bytes to a log file for analysis and playback
 */


//let args = process.argv;

this.config = 
{
    spiDevice: "/dev/spidev0.0"
};

const msb = 0x80;                                                                       // most significant bit (writes have msb set to 1 to denote direction - reads have msb == 0) 


let registers =
{
    ProductId: 0x00,
    RevisionId: 0x01,
    Motion: 0x02,
    Surface_Quality: 0x05,
    Self_Test: { value: 0x10, command: 0x01 },
    CRC0: 0x0c, 
    CRC1: 0x0d, 
    CRC2: 0x0e, 
    CRC3: 0x0f, 
    POWER_28_FE:  { value: 0x28, command: 0xfe },
    POWER_UP_RESET: { value: 0x3a, command: 0x5a },
    Shutdown: { value: 0x3b, command: 0xe7 },
    Inverse_Revision_ID: 0x3e, 
    Inverse_Product_ID: 0x3f,
}


/*
let payload = 
{
    //Self_Test: new Buffer.from([msb | 0x10, 0x01]),                                     // Write 0000 0001 to register 0x10, then you need to wait 250 ms  
    //POWER_UP_RESET: new Buffer.from([msb | registers.POWER_UP_RESET, 0x5a]),            // Write 0x5a to register 0x3a 
    //POWER_28_FE: new Buffer.from([msb | registers.x28, 0xfe]),                          // weird one - this is apparently required in the power-up sequence but register 0x28 is in a range of 'reserved' registers - no idea what this does basically
    //Shutdown: new Buffer.from([msb | registers.Shutdown, 0xe7])
}
//*/

let pins = 
{
    chipSelect: 8
}



// --- initialisation -------------------------------------------------

var piSpi = require("pi-spi");
const Gpio = require('pigpio').Gpio;
var fs = require('fs');
const { SpiQueue, Operation } = require("./lib/SpiQueue");

log('init spi device');
var spi = piSpi.initialize(this.config.spiDevice); 

log(piSpi.mode);
spi.dataMode(piSpi.mode.CPHA);
log(spi.dataMode());


spi.clockSpeed(1e6);									                                // 1Mhz (one tick every micro-second)
//spi.clockSpeed(0x0001ffff);									                            // 131071 Khz (one tick just over every 7.6 micro-seconds - min timings suggest to me that clocking down may eliminate the need for delays waiting for the chip to ready data (way simpler than delaying between operations))
//spi.clockSpeed(0xffff);									                            // 65.535 Khz (one tick just over every 15 micro-seconds)

log('open gpio');
const chipSelect = new Gpio(pins.chipSelect, {mode: Gpio.OUTPUT});
chipSelect.digitalWrite(1);                                                             // chip select high puts ADNS-7050 in high-impedence (I'm not listening) mode                      




let fileName = `spi-mode${spi.dataMode()}.log`; 

/**
 * callback that receives a buffer with written/read byte pairs after each operation
 * @param {*} interleavedBuf buffer containing written/read byte pairs
 */
let saveBuf = (interleavedBuf) =>
{
    fs.appendFile(fileName, interleavedBuf, (err) =>                                                                        // attempt to append the newly interleaved write / read byte pairs to the log ...
    {
        if (err) throw err;                                                                                                     // throw on any error
        console.debug(`appended ${interleavedBuf.length} bytes to ${fileName}`);                                                // log on success
    });
}




let queue = new SpiQueue(spi, saveBuf);

/**
 * Returns a function that will accept a result and compare it against the passed byte value
 * @param {string} name name used to log outcome
 * @param {byte} value The value that should be returned
 * @returns true
 */
function checkExpected(name, value) 
{
    return byte => 
    {
        byte === value ?
            console.log(`${name}: correct`) :
                console.warn(`${name}: doesn't match (expected: ${value.toString(16)}, found: ${byte.toString(16)})`)
        return true;
    }
}


async function go()
{
    // this shouldn't take 10 seconds
    //setTimeout(() => queue.stop(), 10000);

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

    queue.go();

    // 3. Write 0x5a to register 0x3a
    writePayload(registers.POWER_UP_RESET);

    // 4. Wait for tWAKEUP (23 ms)
    //await pause(23);  
    queue.add(new Operation(async () => await pause(23)));
    
    // 5. Write 0xFE to register 0x28
    writePayload(registers.POWER_28_FE);

    /*
    6. Read from registers 0x02, 0x03, and 0x04 (or read
    these same 3 bytes from burst motion register 0x42)
    one time regardless of the motion pin state.
    */
    readRegister(registers.ProductId, checkExpected('ProductId', 0x23));
    readRegister(registers.RevisionId, checkExpected('RevisionId', 0x03));
    readRegister(registers.Inverse_Product_ID, checkExpected('Inverse_Product_ID', 0xdc));
    readRegister(registers.Inverse_Revision_ID, checkExpected('Inverse_Revision_ID', 0xfc));


    writePayload(registers.Self_Test);
    queue.add(new Operation(async () => await pause(300)));

    readRegister(registers.CRC0);
    readRegister(registers.CRC1);
    readRegister(registers.CRC2);
    readRegister(registers.CRC3);


    readRegister(registers.Motion);
    readRegister(registers.Surface_Quality);
    
    writePayload(registers.Shutdown);
    //*/
    
    queue.add(new Operation(async () => await pause(250)));
    //queue.stop();
}


function writePayload(payload, callback)
{   
    callback || (callback = byte => true)
    let name = Object.entries(registers).find(e => e[1] === payload)[0];
    queue.add(new Operation(new Buffer.from([msb | payload.value, payload.command]), callback, name));
}


function readRegister(register, callback)
{
    callback || (callback = (byte => true));
    let name = Object.entries(registers).find(e => e[1] === register)[0];
    queue.add(new Operation(new Buffer.from([register]), callback, name));
}


/**
 * async pause for a number of milliseconds
 * @param {int} timeout async wait time in milliseconds
 */
function pause(timeout) 
{
    console.log(`pausing for ${timeout}ms`);
    return new Promise(resolve => 
    { 
        setTimeout(() => 
        {
            console.log(`finished pausing for ${timeout}ms`);
            resolve();
        }, timeout);
    });
}





//setInterval(go, 5);
go();

