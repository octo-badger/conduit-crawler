
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
    POWER_28_FE: new Buffer.from([msb | registers.x28, 0xfe]),                          // weird one - this is apparently required in the power-up sequence but register 0x28 is in a range of 'reserved' registers - no idea what this does basically
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
//let emptyByteBuf = Buffer.alloc(1).fill(0x50);

class SpiQueue
{
    queue = [];
    started = false;
    newOperationResolver = null;                                                                            // potential reference to a resolver function

    constructor(spi)
    {
        this.spi = spi;
    }
    
    async go()
    {
        this.started = true;

        while(this.started)                                                                                 // screaming loop! ...
        {
            let operation = await next();                                                                       // try to get the next operation (non-blockingly waits for one if the queue is empty)
            do
            {
                let complete = operation.transfer(this.spi);
            }
            while(!complete);
        }
    }

    async add(operation)
    {
        this.queue.push(operation);                                                                             // push the operation onto the queue
        if(this.newOperationResolver)                                                                           // if there's a stored resolver, there wasn't an operation last time next was called, so ...
        {
            this.newOperationResolver(this.queue.shift());                                                          // call the resolver with the operation to process
            this.newOperationResolver = null;                                                                       // clear the stored resolver
        }
    }

    async next()
    {
        return new Promise(resolve =>                                                                           // create and return a new Promise, which ...
                {
                    this.queue[0] ?                                                                                         // if the queue has an operation ready for processing ...
                        resolve(this.queue.shift()) :                                                                           // return that operation immediately ...
                            this.newOperationResolver = resolve;                                                                    // ELSE store the resolver for a future operation
                });
    }

    async stop()
    {
        this.started = false;
    }
}


class Operation
{
    queue = null;

    /**
     * General operation constructor
     * @param {boolean} isRead false for write operation
     * @param {Buffer} payload binary data to send (writes must also send data)
     * @param {function} callback callback to send recieved data to
     * @param {int} dataLength bytes expected (I think this is unnecessary - the callback should return true when all expected data has been received)
     */
    constructor(isRead, payload, callback, dataLength)
    {
        this.isRead = isRead;
        this.payload = payload;
        this.callback = callback;
        this.dataLength = dataLength || 1;
    }

    onAdd(queue)
    {
        this.queue = queue;
    }

    transfer(spi)
    {
        spi.transfer(this.paylode, (err, inBuf) =>
        {
            log('written ' + name, err);
            err && reject(err);
            saveBuf(paylode, inBuf);
            resolve();
        });
    }

    /**
     * could return true if complete, then queue reference wouldn't be needed
     * @param {*} byte 
     */
    async result(byte)
    {
        this.callback(byte);
    }

    complete()
    {
        queue.remove(this);
    }


    //passForward() {}    // would this remove the operation from the queue? this only makes sense if there's a possibility of read data being returned in a different order to the queued operations
    //passBack() {}       // can't see a use for this - the only way an operation could recieve data is if the operation before completed (presumably with all data?)
}

class ReadOperation extends Operation
{
    constructor(register, callback, dataLength)
    {
        super(true, new Buffer.from([register]), callback, dataLength);
    }
}

class WriteOperation extends Operation
{
    constructor(payload, callback, dataLength)
    {
        super(false, payload, callback, dataLength);
    }
}
 

let fileName = `spi-mode${spi.dataMode()}.log`; 
/**
 * spi reads a byte for every written, and conversely writes a byte when reading a byte - this interleaves the two buffers as write/read pairs and appends to fileName
 * @param {Buffer} outBuf written bytes
 * @param {Buffer} inBuf read bytes
 */
let saveBuf = (outBuf, inBuf) =>
{
    if(outBuf.length !== inBuf.length)                                                                                      // if the buffer lengths differ ...
    {
        console.error(`buffer length mismatch: outBuf(${outBuf.length}) / inBuf(${inBuf.length})`);                             // complain - in and out buffers need to be the same length
    }

    let interleavedBuf = Buffer.alloc(outBuf.length * 2);                                                                   // create a buffer twice the length of the in/out buffers - bif enough for all data
    outBuf.subarray().forEach((outByte, i) =>                                                                               // iterate the bytes in the out buffer ...
    {
        let j = (i*2);                                                                                                          // create an index for where this byte pair should sit
        interleavedBuf.writeUInt8(outByte,      j);                                                                             // write the written byte in position one
        interleavedBuf.writeUInt8(inBuf[i],   j+1);                                                                             // write the read byte in position two
    });

    fs.appendFile(fileName, interleavedBuf, (err) =>                                                                        // attempt to append the newly interleaved write / read byte pairs to the log ...
    {
        if (err) throw err;                                                                                                     // throw on any error
        console.debug(`appended ${interleavedBuf.length} bytes to ${fileName}`);                                                // log on success
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
    /*
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
    /*/
    new ReadOperation(register);
    //*/
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

