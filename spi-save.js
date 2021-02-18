

class SpiQueue
{
    constructor(spi, bufferLogCallback)
    {
        this.spi = spi;
        this.bufferLogCallback = bufferLogCallback;                                                             // optional sink for the interleaved transfer buffer
        
        this.queue = [];
        this.started = false;
        this.newOperationResolver = null;                                                                       // potential reference to a resolver function
    }
    

    /**
     * Start procesing queue items.
     * Handles the current and previous operations, setting up the transfer
     */
    async go()
    {
        this.started = true;
        log('starting queue');
        let previousOperation = null;

        while(this.started)                                                                                     // screaming loop! ...
        {
            let operation = await this.next();                                                                       // try to get the next operation (non-blockingly waits for one if the queue is empty)
            log(`got ${operation.str()}`);

            await this.transfer(operation, previousOperation, this.spi);
            previousOperation = operation;
        }
    }


    /**
     * 
     * @param {Operation} operation the operation to add to the queue
     */
    async add(operation)
    {
        log(`adding ${operation.str()} :: (has newOperationResolver: ${this.newOperationResolver == null})`);
        this.queue.push(operation);                                                                             // push the operation onto the queue
        
        if(this.newOperationResolver)                                                                           // if there's a stored resolver, there wasn't an operation last time next was called, so ...
        {
            this.newOperationResolver(this.queue.shift());                                                          // call the resolver with the operation to process
            this.newOperationResolver = null;                                                                       // clear the stored resolver
        }
    }

    /*
    async completionOf(operation)
    {
        /// await completionOf(operation) - blocks until the passed operation has completed?
        /// may not be necessary as the queue will pause when no new operations are available
    }
    //*/
    

    /**
     * Transfer those pesky bytes
     * Handles spi transfer and routing bytes to the correct operations
     * @param {Operation} operation current operation to process
     * @param {Operation} previousOperation the previous operation - may be waiting for data
     * @param {piSpi} spi the spi bus object
     */
    async transfer(operation, previousOperation, spi)
    {
        log(`transferring ${operation.payload.toString('hex')} bytes`);
        let transferring = true;

        //while(transferring && this.started)
        {
            await new Promise((resolve, reject) => 
            {
                log('in promise');
                
                try
                {
                    spi.transfer(operation.payload, (err, inBuf) =>
                    {
                        log('written ' + operation.payload.toString('hex'), err);
                        err && reject();

                        this.saveBuf(operation.payload, inBuf);
                        inBuf.subarray().forEach((byte, i) =>                                                           // iterate the bytes in retreived buffer ...
                        {
                            if(previousOperation && previousOperation.result(byte))
                            {
                                previousOperation = null;
                            }
                            else
                            {
                                /*
                                transferring &&= operation.result(byte);                                                   // if transferring is still true, pass the byte to the operation and update the transferring flag (this allows the operation to)
                                /*/
                                transferring = transferring && operation.result(byte);                                                   // if transferring is still true, pass the byte to the operation and update the transferring flag (this allows the operation to)
                                //*/
                            }
                        });
                        resolve();
                    });
                }
                catch(e)
                {
                    log('error', e);
                    reject();
                }
            });
            log('after promise')
        }
    }


    /**
     * (internal) Gets the next queued operation (or the promise of the next one when it's added)
     */
    async next()
    {
        return new Promise(resolve =>                                                                           // create and return a new Promise, which ...
                {
                    log(`queue length: ${this.queue.length}`);

                    this.queue[0] ?                                                                                         // if the queue has an operation ready for processing ...
                        resolve(this.queue.shift()) :                                                                           // return that operation immediately ...
                            this.newOperationResolver = resolve;                                                                    // ELSE store the resolver for a future operation
                });
    }


    /**
     * stop the queue, I'm getting off
     */
    async stop()
    {
        log('stopping queue');
        this.started = false;
    }


    /**
     * spi reads a byte for every written, and conversely writes a byte when reading a byte - this interleaves the two buffers as write/read pairs and appends to fileName
     * @param {Buffer} outBuf written bytes
     * @param {Buffer} inBuf read bytes
     */
    saveBuf(outBuf, inBuf)
    {
        if(this.bufferLogCallback)
        {
            if(outBuf.length !== inBuf.length)                                                                                      // if the buffer lengths differ ...
            {
                console.error(`buffer length mismatch: outBuf(${outBuf.length}) / inBuf(${inBuf.length})`);                             // complain - in and out buffers need to be the same length
            }
        
            let interleavedBuf = Buffer.alloc(outBuf.length * 2);                                                                   // create a buffer twice the length of the in/out buffers - bif enough for all data
            outBuf.subarray().forEach((outByte, i) =>                                                                               // iterate the bytes in the out buffer ...
            {
                let j = (i*2);                                                                                                          // create an index for where this byte pair should sit
                interleavedBuf.writeUInt8(outByte,  j);                                                                                 // write the written byte in position one
                interleavedBuf.writeUInt8(inBuf[i], j+1);                                                                               // write the read byte in position two
            });
        
            this.bufferLogCallback(interleavedBuf);
        }
    }

}


class Operation
{
    /**
     * General operation constructor
     * @param {Buffer} payload binary data to send (writes must also send data)
     * @param {function} callback callback to send recieved data to
     */
    constructor(payload, callback)
    {
        this.payload = payload;
        this.callback = callback;
    }


    /**
     * could return true if complete, then queue reference wouldn't be needed
     * @param {*} byte 
     */
    async result(byte)
    {
        log(`resulting byte: ${byte.toString('hex')}`);
        let complete = this.callback(byte);
        let keepTransfering = complete !== true;
        return keepTransfering;
    }


    str()
    {
        let msg = `operation ${this.payload.length} bytes: ${this.payload.toString('hex')}`;
        return msg;
    }
}

 


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

let saveBuf = (interleavedBuf) =>
{
    fs.appendFile(fileName, interleavedBuf, (err) =>                                                                        // attempt to append the newly interleaved write / read byte pairs to the log ...
    {
        if (err) throw err;                                                                                                     // throw on any error
        console.debug(`appended ${interleavedBuf.length} bytes to ${fileName}`);                                                // log on success
    });
}




let queue = new SpiQueue(spi, saveBuf);



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
    await writePayload(payload.POWER_UP_RESET);

    // 4. Wait for tWAKEUP (23 ms)
    await wait(23);
    
    // 5. Write 0xFE to register 0x28
    await writePayload(payload.POWER_28_FE);

    /*
    6. Read from registers 0x02, 0x03, and 0x04 (or read
    these same 3 bytes from burst motion register 0x42)
    one time regardless of the motion pin state.
    */
    await readRegister(registers.ProductId, byte => 
        {
            return byte == 0x23
        });
    await readRegister(registers.RevisionId, byte => 
        {
            return byte === 0x03
        });
    await readRegister(registers.Inverse_Product_ID, byte => byte === 0xdc);
    await readRegister(registers.Inverse_Revision_ID, byte => byte === 0xdc);
    await readRegister(registers.Motion);
    await readRegister(registers.Surface_Quality);
    
    await writePayload(payload.Shutdown);
    //*/
    
    //queue.stop();
}


async function writePayload(paylode, callback)
{   
    callback || (callback = byte => true)
    queue.add(new Operation(paylode, callback));
}


async function readRegister(register, callback)
{
    callback || (callback = (byte => true));
    queue.add(new Operation(new Buffer.from([register]), callback));
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

