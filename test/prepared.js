var should = require('should');
var crypto = require('crypto');


var Schema = require('../index').Schema;
var Text = Schema.Text;

var credentials = {
    database: 'jugglingdb',
    username: 'jugglingdb_dev',
    password: 'jugglingdb'
};

var tablename1 = 'test_preparedstatements';
var tablename2 = 'test_preparedstatements_relation';
var sqlStatements = [];

function findRemoveSQLStatement(find) {
    var i = sqlStatements.indexOf(find);
    if(i !== -1) {
        i =  sqlStatements.splice(i, 1);
        sqlStatements = [];
        return i;
    }
    sqlStatements = [];
    return false;
}

describe('init and connect to database', function() {
    var schema, adapter, cDataTypes, cDataTypesRelation;

    before(function() {
        schema = new Schema('mysql', credentials);

        schema.log = function(msg) {
            if (process.env.SHOW_SQL) {
                console.log("QUERY LOG: >" + msg + "<");
            }
            
            sqlStatements.push(msg);
        }
    });

    it('should establish a connection to database', function(done) {
        if(schema.connected) {
            schema.connected.should.be.true;
        } else {
            schema.on('connected', function() {
                Object.should.be.ok;
                done();
            });
        }
    });
    
    describe('definition of models', function() {
        
        it('should define models', function(done) {
            
            cDataTypes = schema.define(tablename1, {
                sString : {type : String},
                nNumber : {type : Number},
                tText : {type : Schema.Text},
                bBool : {type : Boolean, default: false},
                dDate : {type : Date}
            });
            
            cDataTypesRelation = schema.define(tablename2, {
                sString : {type : String},
                nNumber : {type : Number},
                tText : {type : Schema.Text},
                bBool : {type : Boolean, default: false},
                dDate : {type : Date}
            });
            
            cDataTypes.hasMany(cDataTypesRelation,   {as: 'relation',  foreignKey: 'relationId'});
            
            schema.automigrate(function() {
                done();
            });
        });
    });
        
    describe('validate the automigrated models', function() {
        var client;
        
        before(function() {
            client = schema.adapter.client;
        });

        it('should have created the table', function(done) {
            client.query('SHOW TABLES', function(err, result, info) {

                should.not.exist(err);
                should.exist(result);
                result.should.be.instanceOf(Array);
                result.length.should.be.above(0);

                var tables = result.map(function(table) {
                    for(var i in table) {
                        if(table.hasOwnProperty(i)) {
                            return table[i];
                        }
                        return null;
                    }
                });
                tables.should.include('cDataTypes');

                done();
            });
        });
    });
    
    describe('test prepared statements', function() {
        var testDataLength = 2;
            
        describe('MODEL.all()...', function() {
            var testingCounter = 0;
            
            before(function(done) {
                cDataTypes.destroyAll(function() {
                    findRemoveSQLStatement('DELETE FROM `'+tablename1+'`');
                    done();
                });
            });

            beforeEach(function(done) {
                // Insert dummy data
                for(var i = 0; i < testDataLength; i++, testingCounter++) {

                    cDataTypes.create({
                        sString : 'string-' + testingCounter,
                        nNumber : i,
                        tText   : 'text-string-' + testingCounter,
                        bBool   : i % 2,
                        dDate   : new Date(2012, 8, 1, 12, 0, testingCounter, 0)
                    });
                }
                done();
            });
            
            it('should not use prepared statements', function(done) {
                cDataTypes.all(function(err, result) {
                    should.not.exist(err);
                    should.exist(result);
                    result.should.be.instanceOf(Array).with.lengthOf(testDataLength);
                    
                    findRemoveSQLStatement('SELECT * FROM `'+tablename1+'`').should.not.be.false;
                    
                    done();
                });
            });
            
            describe('MODEL.all({order: sString DESC}) ...', function() {
                it('should not use prepared statements', function(done) {
                    cDataTypes.all({
                        order: 'sString DESC'
                    }, function(err, result) {
                        should.not.exist(err);
                        should.exist(result);
                        result.should.be.instanceOf(Array).with.lengthOf(4);

                        findRemoveSQLStatement("SELECT * FROM `"+tablename1+"` ORDER BY sString DESC").should.not.be.false;
                        done();
                    });
                });
            });

            describe('MODEL.all({limit: 2}) ...', function() {
                it('should not use prepared statements', function(done) {
                    cDataTypes.all({
                        limit : 2
                    }, function(err, result) {
                        should.not.exist(err);
                        should.exist(result);
                        result.should.be.instanceOf(Array).with.lengthOf(2);

                        findRemoveSQLStatement("SELECT * FROM `"+tablename1+"` LIMIT 2").should.not.be.false;
                        done();
                    });
                });
            });

            describe('MODEL.all({limit 10, skip: 2}) ...', function() {
                it('should not use prepared statements', function(done) {
                    cDataTypes.all({
                        limit  : Math.pow(2, 63),
                        offset : 2
                    }, function(err, result) {
                        should.not.exist(err);
                        should.exist(result);
                        result.should.be.instanceOf(Array).with.lengthOf(6);

                        findRemoveSQLStatement("SELECT * FROM `"+tablename1+"` LIMIT 2, 9223372036854776000").should.not.be.false;
                        done(); 
                    });
                });
            });

            describe('MODEL.all({where: {}}) ...', function() {
                it('should use prepared statements', function(done) {
                    cDataTypes.all({
                        where : {
                            sString : 'string-1'
                        }
                    }, function(err, result) {
                        should.not.exist(err);
                        should.exist(result);
                        result.should.be.instanceOf(Array).with.lengthOf(1);

                        findRemoveSQLStatement("SELECT * FROM `"+tablename1+"` WHERE `sString` = ?").should.not.be.false;
                        done();
                    });
                });
            });

            describe('MODEL.all({where: {<multiple-and>}}) ...', function() {
                it('should use prepared statements', function(done) {
                    cDataTypes.all({
                        where : {
                            sString : 'string-1',
                            nNumber : 1,
                            tText   : 'text-string-1',
                            bBool   : 1,
                            dDate   : new Date(2012, 8, 1, 12, 0, 1, 0)
                        }
                    }, function(err, result) {
                        should.not.exist(err);
                        should.exist(result);
                        result.should.be.instanceOf(Array).with.lengthOf(1);

                        findRemoveSQLStatement("SELECT * FROM `"+tablename1+"` WHERE `sString` = ? " + 
                                                "AND `nNumber` = ? AND `tText` = ? " + 
                                                "AND `bBool` = ? AND `dDate` = ?").should.not.be.false;
                        done();
                    });
                });
            });
        });
        
        
        
        describe('MODEL.find() ...', function() {
            var testingCounter = 0;
            
            before(function(done) {
                cDataTypes.destroyAll(function() {
                    findRemoveSQLStatement('DELETE FROM `'+tablename1+'`');
                    done();
                });
            });

            beforeEach(function(done) {
                // Insert dummy data
                for(var i = 0; i < testDataLength; i++, testingCounter++) {

                    cDataTypes.create({
                        sString : 'string-' + testingCounter,
                        nNumber : i,
                        tText   : 'text-string-' + testingCounter,
                        bBool   : i % 2,
                        dDate   : new Date(2012, 8, 1, 12, 0, testingCounter, 0)
                    });
                }
                done();
            });
            
            describe('MODEL.find(<id>)', function() {
                it('should use prepared statements', function(done) {
                    cDataTypes.find(13, function(err, row) {
                        should.not.exist(err);
                        should.exist(row);
                        
                        row.id.should.eql(13)

                        findRemoveSQLStatement("SELECT * FROM `"+tablename1+"` WHERE `id` = ? LIMIT 1").should.not.be.false;
                        done();
                    });
                });
            });
        });
        
        
        describe('MODEL.save() ...', function() {
            var testingCounter = 0;
            
            before(function(done) {
                cDataTypes.destroyAll(function() {
                    findRemoveSQLStatement('DELETE FROM `'+tablename1+'`');
                    done();
                });
            });

            beforeEach(function(done) {
                // Insert dummy data
                var total = 0;
                for(var i = 0; i < testDataLength; i++, testingCounter++) {

                    cDataTypes.create({
                        sString : 'string-' + testingCounter,
                        nNumber : i,
                        tText   : 'text-string-' + testingCounter,
                        bBool   : i % 2,
                        dDate   : new Date(2012, 8, 1, 12, 0, testingCounter, 0)
                    }, isDone);
                }
                function isDone() {
                    if(++total === testDataLength) {
                        done()
                    }
                }
            });
            it('should use prepared statements', function(done) {

                var newInstance = new cDataTypes({
                    sString : 'upsert-1',
                    nNumber : 123,
                    tText   : 'text-string-upsert-1',
                    bBool   : 1,
                    dDate   : new Date(2012, 8, 1, 12, 0, 0, 0)
                });

                cDataTypes.find(15, function(err, result) {
                    result.sString = 'NEWVALUE';
                    result.save(function(err) {
                        
                        findRemoveSQLStatement("UPDATE `"+tablename1+"` SET `sString` = ?,`nNumber` = ?,`tText` = ?,`bBool` = ?,`dDate` = ? WHERE `id` = ?").should.not.be.false;

                        
                        done();
                    });
                })
            });
        });
        
        describe('MODEL.updateOrCreate() ...', function() {
            var testingCounter = 0;
            
            before(function(done) {
                cDataTypes.destroyAll(function() {
                    findRemoveSQLStatement('DELETE FROM `'+tablename1+'`');
                    done();
                });
            });

            beforeEach(function(done) {
                // Insert dummy data
                var total = 0;
                for(var i = 0; i < testDataLength; i++, testingCounter++) {

                    cDataTypes.create({
                        sString : 'string-' + testingCounter,
                        nNumber : i,
                        tText   : 'text-string-' + testingCounter,
                        bBool   : i % 2,
                        dDate   : new Date(2012, 8, 1, 12, 0, testingCounter, 0)
                    }, isDone);
                }
                function isDone() {
                    if(++total === testDataLength) {
                        done()
                    }
                }
            });
            
            describe('new record', function() {
                
                it('should use prepared statements', function(done) {
                    
                    var newInstance = new cDataTypes({
                        sString : 'upsert-1',
                        nNumber : 123,
                        tText   : 'text-string-upsert-1',
                        bBool   : 1,
                        dDate   : new Date(2012, 8, 1, 12, 0, 0, 0)
                    });
                    
                    cDataTypes.updateOrCreate(newInstance, function(err, row) {
                        
                        should.not.exist(err);
                        should.exist(row);
                        
                        row.should.have.keys('id', 'sString', 'nNumber', 'tText', 'bBool', 'dDate');
                        row.id.should.eql(19);
                        row.sString.should.eql('upsert-1');
                        row.nNumber.should.eql(123);
                        row.tText.should.eql('text-string-upsert-1');
                        row.bBool.should.eql(1);
                        row.dDate.should.eql(1346500800000); //@todo bug? shouldn't it return a JS Date Object?
                        
                        findRemoveSQLStatement("INSERT INTO `"+tablename1+"` SET `sString` = ?,`nNumber` = ?,`tText` = ?,`bBool` = ?,`dDate` = ?").should.not.be.false;
                        done();
                    });
                });
            });
            
            describe('existing record', function() {
                
                it('should use prepared statements', function(done) {
                    
                    cDataTypes.find(19, function(err, result) {
                        result.sString = 'EDITED';
                        result.nNumber = 999;
                        findRemoveSQLStatement();
                        
                        cDataTypes.updateOrCreate(result, function(err, row) {
                            should.not.exist(err);
                            should.exist(row);

                            row.should.have.keys('id', 'sString', 'nNumber', 'tText', 'bBool', 'dDate');
                            row.id.should.eql(19);
                            row.sString.should.eql('EDITED');
                            row.nNumber.should.eql(999);
                            row.tText.should.eql('text-string-upsert-1');
                            row.bBool.should.eql(1);
                            row.dDate.should.eql(1346500800000); //@todo bug? shouldn't it return a JS Date Object?

                            findRemoveSQLStatement("INSERT INTO `"+tablename1+"` (`id`, `sString`, `nNumber`, `tText`, `bBool`, `dDate`) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE `sString` = ?, `nNumber` = ?, `tText` = ?, `bBool` = ?, `dDate` = ?").should.not.be.false;
                            done();
                        })
                    })
                });
            });
        });
        
        describe('MODEL.count() ...', function() {
            var testingCounter = 0;
            
            before(function(done) {
                cDataTypes.destroyAll(function() {
                    findRemoveSQLStatement('DELETE FROM `'+tablename1+'`');
                    done();
                });
            });

            beforeEach(function(done) {
                // Insert dummy data
                var total = 0;
                for(var i = 0; i < testDataLength; i++, testingCounter++) {

                    cDataTypes.create({
                        sString : 'string-count-' + testingCounter,
                        nNumber : i,
                        tText   : 'text-string-count-' + testingCounter,
                        bBool   : i % 2,
                        dDate   : new Date(2012, 8, 1, 12, 0, testingCounter, 0)
                    }, isDone);
                }
                function isDone() {
                    if(++total === testDataLength) {
                        done()
                    }
                }
            });
            
            describe('MODEL.count()', function() {
                
                it('should not use prepared statements', function(done) {

                    cDataTypes.count(function(err, result) {
                        should.not.exist(err);
                        should.exist(result);

                        result.should.eql(2);
                        //@todo: Space at the end of query, not needed, check sources to remove this
                        findRemoveSQLStatement("SELECT count(*) AS cnt FROM `"+tablename1+"` ").should.not.be.false;
                        
                        done()
                    })
                });
            });
            
            describe('MODEL.count({<where>})', function() {
                
                it('should not use prepared statements', function(done) {

                    cDataTypes.count({
                            sString : 'string-count-0'
                        }, function(err, result) {
                        should.not.exist(err);
                        should.exist(result);

                        result.should.eql(1);
                        //@todo: Space between `tablename1` and WHRE, not needed, check sources to remove this
                        findRemoveSQLStatement("SELECT count(*) AS cnt FROM `"+tablename1+"`  WHERE `sString` = ?").should.not.be.false;
                        
                        done()
                    })
                });
            });
            
            describe('MODEL.count({<multi-where})', function() {
                
                it('should not use prepared statements', function(done) {

                    cDataTypes.count({
                            sString : 'string-count-1',
                            nNumber : 1
                        }, function(err, result) {
                        should.not.exist(err);
                        should.exist(result);

                        result.should.eql(1);
                        //@todo: Space between `tablename1` and WHRE, not needed, check sources to remove this
                        findRemoveSQLStatement("SELECT count(*) AS cnt FROM `"+tablename1+"`  WHERE `sString` = ? AND `nNumber` = ?").should.not.be.false;
                        
                        done()
                    })
                });
            });
        });
        
        describe('MODEL.<relation>()', function() {
            var testingCounter = 0;
            
            before(function(done) {
                cDataTypes.destroyAll(function() {
                    findRemoveSQLStatement('DELETE FROM `'+tablename1+'`');
                    cDataTypesRelation.destroyAll(function() {
                        findRemoveSQLStatement('DELETE FROM `'+tablename2+'`');
                        done();
                    })
                });
            });

            beforeEach(function(done) {
                // Insert dummy data
                var total = 0;
                for(var i = 0; i < testDataLength; i++, testingCounter++) {
                    cDataTypes.create({
                        sString : 'string-rel-' + testingCounter,
                        nNumber : i,
                        tText   : 'text-string-rel-' + testingCounter,
                        bBool   : i % 2,
                        dDate   : new Date(2012, 8, 1, 12, 0, testingCounter, 0)
                    }, function(err, row) {
                        
                        var totelRel = 0,
                            testRelLength = 5,
                            i;
                        
                        for(i = 0; i < testRelLength; i++) {
                            row.relation.build({
                                sString : 'string-rel-relation-1-' + i,
                                nNumber : row.nNumber + 100,
                                tText   : 'text-string-rel-relation-1-' + i,
                                bBool   : (i % 2 === 0) ? 1 : 0,
                                dDate   : new Date(2012, 8, 1, 12, 0, 0, 0)
                            }).save(function(err, relRow) {
                                if(err) {
                                    throw err;
                                }
                                relIsDone();
                            });
                        }
                        
                        function relIsDone() {
                            if(++totelRel === testRelLength) {
                                isDone()
                            }
                        }
                    });
                }
                
                function isDone() {
                    if(++total === testDataLength) {
                        done()
                    }
                }
            });
            it('MODEL.relation() should use prepared statements', function(done) {
                
                cDataTypes.find(28, function(err, row) {
                    
                    row.relation(function(err, result) {
                        should.not.exist(err);
                        should.exist(result);
                        
                        result.should.be.lengthOf(5);
                        findRemoveSQLStatement("SELECT * FROM `"+tablename2+"` WHERE `relationId` = ?").should.not.be.false;
                        done()
                    });
                })
                
            });

        });
    });
});