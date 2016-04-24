var processPosition = require('./processPosition');
var sinon = require('sinon');
var child_process = require('child_process');
var should = require('should');

describe('Process Positions', () => {
    describe('Command Line Parsing', () => {
        function cliparse(dataline) {
            switch (dataline) {
            case 0:
                return 'process-ais-position [INPUT DIRECTORY] ';
            case 1:
                return 'process-ais-position Source files are being archived';
            case 2:
                return 'process-ais-position Program complete';
            }
        }

        it('should say "process-ais-position [INPUT DIRECTORY]" and directory', (done) => {
            var program = child_process.spawn('./processPosition');
            var gotOutput = false;
            var lineNum = 0;

            program.stdout.on('data', (data) => {
                if (lineNum === 1) {
                     //skips archive line
                } else if (lineNum === 0) {
                    data.toString()
                        .should.equal(cliparse(lineNum) +
                            '/home/traskcs/dev/python/ais/data/\n');
                    gotOutput = true;
                } else if (lineNum === 2) {
                    data.toString().should.equal(cliparse(lineNum));
                }
                lineNum++;
            });

            program.on('exit', (exitCode) => {
                exitCode.should.equal(0);
                gotOutput.should.equal(true);
                done();
            });

            program.on('error', (err) => {
                should.err.not.exist;
                done();
            });
        });
    });
});
