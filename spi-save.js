
//let args = process.argv;

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
    ProductId: 0x00,
    RevisionId: 0x01,
    Motion: 0x02,
    Surface_Quality: 0x05,
    x28: 0x28,
    POWER_UP_RESET: 0x3a,
    Shutdown: 0x3b,
    Inverse_Revision_ID: 0x3e, 
    Inverse_Product_ID: 0x3f,
}


let payload = 
{
    POWER_UP_RESET: new Buffer.from([msb | registers.POWER_UP_RESET, 0x5a]),            // Write 0x5a to register 0x3a 
    POWER_28_FE: new Buffer.from([msb | registers.x28, 0xfe]),                           // weird one - this is apparently required in the power-up sequence but register 0x28 is in a range of 'reserved' registers - no idea what this does basically
    Shutdown: new Buffer.from([msb | registers.Shutdown, 0xe7])
}

let pins = 
{
    chipSelect: 8
}


// --- initialisation -------------------------------------------------

var piSpi = require("pi-spi");
const Gpio = require('pigpio').Gpio;
var fs = require('fs');

log('init spi device');
var spi = piSpi.initialize("/dev/spidev0.0");

log(piSpi.mode);
spi.dataMode(piSpi.mode.CPHA);
log(spi.dataMode());


spi.clockSpeed(1e6);									                                // 1Mhz (one tick every micro-second)
//spi.clockSpeed(0x0001ffff);									                            // 131071 Khz (one tick just over every 7.6 micro-seconds - min timings suggest to me that clocking down may eliminate the need for delays waiting for the chip to ready data (way simpler than delaying between operations))
//spi.clockSpeed(0xffff);									                            // 65.535 Khz (one tick just over every 15 micro-seconds)

log('open gpio');
const chipSelect = new Gpio(pins.chipSelect, {mode: Gpio.OUTPUT});
chipSelect.digitalWrite(1);                                                             // chip select high puts ADNS-7050 in high-impedence (I'm not listening) mode                      

/*
var BUFFER_SIZE_OUT = 64;
var BUFFER_SIZE_IN = 64;
var input = Buffer(BUFFER_SIZE_IN);
var output = Buffer(BUFFER_SIZE_OUT);

var blocks = [];

var count = 0;
//*/
let emptyByteBuf = Buffer.alloc(1).fill(0x50);


let fileName = `spi-mode${spi.dataMode()}.log`; 
let saveBuf = (outBuf, inBuf) =>
{
    if(outBuf.length !== inBuf.length)
    {
        console.error(`buffer length mismatch: outBuf(${outBuf.length}) / inBuf(${inBuf.length})`);
    }

    let interleavedBuf = Buffer.alloc(outBuf.length * 2);
    outBuf.subarray().forEach((outByte, i) => 
    {
        let j = (i*2);
        interleavedBuf.writeUInt8(outByte,      j);
        interleavedBuf.writeUInt8(inBuf[i],   j+1);
    });


    fs.appendFile(fileName, interleavedBuf, (err) => 
    {
        if (err) throw err;
        console.log(`appended ${interleavedBuf.length} bytes to ${fileName}`);
    });
}



async function go()
{
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
    await writePayload(payload.POWER_UP_RESET, 'POWER_UP_RESET');

    // 4. Wait for tWAKEUP (23 ms)
    await wait(23);
    
    // 5. Write 0xFE to register 0x28
    await writePayload(payload.POWER_28_FE, 'POWER_28_FE');


    /*
    6. Read from registers 0x02, 0x03, and 0x04 (or read
    these same 3 bytes from burst motion register 0x42)
    one time regardless of the motion pin state.
    */
    await readRegister(registers.ProductId);
    await readRegister(registers.RevisionId);
    await readRegister(registers.Inverse_Product_ID);
    await readRegister(registers.Inverse_Revision_ID);
    await readRegister(registers.Motion);
    await readRegister(registers.Surface_Quality);
    
    await writePayload(payload.Shutdown, 'Shutdown');
}


async function writePayload(paylode, name)
{
    return new Promise((resolve, reject) => 
    {
        /*
        spi.write(paylode, (err) =>
        {
            log('written ' + name, err);
            err && reject(err);
            resolve();
        });
        /*/
        spi.transfer(paylode, (err, inBuf) =>
        {
            log('written ' + name, err);
            err && reject(err);
            saveBuf(paylode, inBuf);
            resolve();
        });
        //*/
    });
    await wait(10);
}


async function readRegister(register)
{
    await new Promise((resolve, reject) => 
    {
        //spi.write(new Buffer.from([register]), (err) =>
        let paylode = new Buffer.from([register]); 
        spi.transfer(paylode, (err, inBuf) =>
        {
            log(`requested register ${register.toString(16)}`, err);
            err && reject(err);
            saveBuf(paylode, inBuf);
            resolve();
        });   
    });
    
    await wait(10);
    await new Promise((resolve, reject) => 
    {
        //spi.read(4, (err, inBuf) =>
        spi.transfer(emptyByteBuf, (err, inBuf) =>
        {
            log('readed stuffs', err);
            saveBuf(emptyByteBuf, inBuf);
            for (const pair of inBuf.entries()) 
            {
                log(`${pair[0]}: ${pair[1].toString(2)}`);
            }
            resolve();
        });
    });
    await wait(10);
}


/**
 * async pause for a number of milliseconds
 * @param {int} timeout async wait time in miiliseconds
 */
function wait(timeout) 
{
    log(`waiting for ${timeout}ms`);
    return new Promise(resolve => 
    {
        setTimeout(() => 
        {
            log(`finished waiting for ${timeout}ms`);
            resolve();
        }, timeout);
    });
}





//setInterval(go, 5);
go();

