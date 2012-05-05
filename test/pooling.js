var assert = require('assert');
var should = require('should');

var Schema = require('../index').Schema;
var Text = Schema.Text;

var credentials = {
    database: 'jugglingdb',
    username: 'jugglingdb_dev',
    password: 'jugglingdb',
    pool: 5
};

describe('init and connect to database', function() {
    var schema, adapter, tModel;

    before(function(done) {
        schema = new Schema('mysql', credentials);

        schema.log = function(msg) {
            if (process.env.SHOW_SQL) {
                console.log(msg);
            }
        }
        
        var total = 0;
        
        schema.on('connected', function() {

            tModel = schema.define('TACTIONTEST', {
                value:       {type: String, index: true}
            });

            adapter = schema.adapter;
            total += 1;
            checkDone()
        });
        
        function checkDone() {
            if(total === credentials.pool) {
                schema.automigrate(function(err) {
                    should.not.exist(err);
                    done()
                });
            }
        }
    });
    
    it('should setup the connection pool', function(done) {
        adapter.pool.should.exist;
        adapter.pool.should.be.lengthOf(5);
        
        done();
    });

    it('should establish a connection to database', function(done) {
        if(schema.connected) {
            schema.connected.should.be.true;
            done()
        } else {
            schema.on('connected', function() {
                Object.should.be.ok;
                done();
            });
        }
    });
    
    it('should be possible to get a locked connection', function(done) {
        var client = adapter.getClient(true);
        adapter.pool.should.exist;
        adapter.pool.should.be.lengthOf(4);
        
        // we need manually push back the locked adapter
        adapter.pool.push(client);
        adapter.pool.should.be.lengthOf(5);
        
        done();
    });
    
    
    describe('Transactions test', function() {
        
        it('should init a new transaction with a locked client', function(done) {
            var transaction = adapter.startTransaction();
            
            transaction.should.have.property('queue');
            transaction.queue.should.be.instanceOf(Array).and.have.lengthOf(0);
            
            transaction.should.have.property('adapter');
            transaction.adapter.should.equal(adapter);
            
            transaction.should.have.property('client');
            adapter.pool.should.not.include(transaction.client)
            
            // rollback to free the client connection
            transaction.rollback(function() {
                done();
            });

        });
        
        it('should perform a transaction and commit', function(done) {
            var transaction = adapter.startTransaction();
            
            // add some query
            transaction.query('INSERT INTO TACTIONTEST (value) VALUES ("name0")');
            transaction.query('INSERT INTO TACTIONTEST (value) VALUES ("name1")');
            transaction.query('INSERT INTO TACTIONTEST (value) VALUES ("name2")');
            transaction.query('INSERT INTO TACTIONTEST (value) VALUES ("name3")');
            transaction.query('INSERT INTO TACTIONTEST (value) VALUES ("name4")');
            
            transaction.queue.should.have.lengthOf(5);
            
            var i, el;
            for(i = 0; i < 5; i++) {
                el = transaction.queue[i];
                el.should.be.instanceOf(Object);
                el.should.have.property('sql', 'INSERT INTO TACTIONTEST (value) VALUES ("name'+i+'")');
                should.equal(el.cb, undefined);
            }
            
            transaction.execute(function() {
                transaction.commit(function(err) {
                    if(err) {
                        transaction.rollback(done);
                        should.not.exist(err);
                    } else {
                        
                        tModel.all(function(err, result) {
                            var i, record;
                            should.not.exist(err);
                            should.exist(result);
                            result.should.be.instanceOf(Array).and.have.lengthOf(5);
                            for(i = 0; i < 5; i++) {
                                record = result[i];
                                record.should.have.property('value', 'name' + i);
                            }
                            done();
                        });
                    }
                });
            });
        });
        
        it('should perform a transaction and while add queries before commit', function(done) {
            var transaction = adapter.startTransaction();
            
            // add some query in a callback after a successfull query
            transaction.query('INSERT INTO TACTIONTEST (value) VALUES ("name_aqbc0")', function(err, result) {
                arguments.should.be.arguments;
                should.not.exist(err);
                
                result.should.have.property('affectedRows')
                result.affectedRows.should.be.above(0);
                
                transaction.query('INSERT INTO TACTIONTEST (value) VALUES ("name_aqbc1")', function(err, result) {
                    arguments.should.be.arguments;
                    should.not.exist(err);

                    result.should.have.property('affectedRows')
                    result.affectedRows.should.be.above(0);
                });
            });
            
            transaction.queue.should.have.lengthOf(1);
            
            transaction.queue[0].sql.should.eql('INSERT INTO TACTIONTEST (value) VALUES ("name_aqbc0")')
            
            transaction.execute(function() {
                transaction.queue.should.have.lengthOf(0);
                
                
                transaction.commit(function() {
                    
                    tModel.all({where: {value : 'name_aqbc0'}}, function (err, result) {
                        should.exist(result);
                        should.not.exist(err);
                        
                        result.should.be.instanceOf(Array);
                        result.should.have.lengthOf(1);
                        should.exist(result[0].value);
                        result[0].value.should.eql('name_aqbc0');
                        
                        tModel.all({where : {value: 'name_aqbc1'}}, function (err, result) {
                            should.exist(result);
                            should.not.exist(err);

                            result.should.be.instanceOf(Array);
                            result.should.have.lengthOf(1);
                            should.exist(result[0].value);
                            result[0].value.should.eql('name_aqbc1');
                            done();
                        });
                    })
                });
            });
        });
        
        it('should be possible to have 2 transactions at the same time', function (done) {
            var tr1 = adapter.startTransaction(),
                tr2 = adapter.startTransaction(),
                totalDone = 2;

            tr1.query('INSERT INTO TACTIONTEST (value) VALUES ("name_2tr10")');
            tr2.query('INSERT INTO TACTIONTEST (value) VALUES ("name_2tr20")');
            
            tr1.execute(function () {
                tr2.execute(function (parameters) {
                    tr1.commit(function () {
                        isDone();
                    });
                    tr2.commit(function () {
                        isDone();
                    });
                })
            });
            
            function isDone() {
                totalDone -= 1;
                if(totalDone == 0) {
                    done();
                }
            }
        });
        it('should be possible to have 5 transactions at the same time', function (done) {
            var tr1 = adapter.startTransaction(),
                tr2 = adapter.startTransaction(),
                tr3 = adapter.startTransaction(),
                tr4 = adapter.startTransaction(),
                tr5 = adapter.startTransaction(),
                totalDone = 5;

            tr1.query('INSERT INTO TACTIONTEST (value) VALUES ("name_2tr10")');
            tr2.query('INSERT INTO TACTIONTEST (value) VALUES ("name_2tr20")');
            tr3.query('INSERT INTO TACTIONTEST (value) VALUES ("name_2tr30")');
            tr4.query('INSERT INTO TACTIONTEST (value) VALUES ("name_2tr40")');
            tr5.query('INSERT INTO TACTIONTEST (value) VALUES ("name_2tr50")');
            
            tr1.execute(function () {
                tr2.execute(function (parameters) {
                    // random order of commit calls
                    tr5.commit(function () {
                        isDone();
                    });
                    tr2.commit(function () {
                        isDone();
                        tr3.commit(function () {
                            isDone();
                        });
                        tr4.commit(function () {
                            isDone();
                        });
                    });
                })
            });
            
            
            tr1.commit(function () {
                isDone();
            });
            
            function isDone() {
                totalDone -= 1;
                if(totalDone == 0) {
                    done();
                }
            }
        });
        
        it('should not be possible to have 6 transactions at the same time because pool size is 5', function (done) {
            
            var clients = [];
            (function(){
                var tr1 = adapter.startTransaction(),
                    tr2 = adapter.startTransaction(),
                    tr3 = adapter.startTransaction(),
                    tr4 = adapter.startTransaction(),
                    tr5 = adapter.startTransaction(),
                    tr6;
                    
                    // get the clients from the transactions before this test will fail
                    // we need to release the clients later again
                    clients.push(tr1.client, tr2.client, tr3.client, tr4.client, tr5.client);
                    
                    tr6 = adapter.startTransaction();
            }).should.throw();
            
            
            // release the clients to pool
            adapter.pool = clients;
            adapter.pool.should.be.lengthOf(5);
            done();
        });
        
        it('should use ROLLBACK if .end() is called on transaction queue with SQL param', function (done) {
            var tr = adapter.startTransaction();
            
            tr.query('INSERT INTO TACTIONTEST (value) VALUES ("rollbackendtest")', function() {
                tr.query('SELECT * FROM TACTIONTEST', function(err, result) {
                    console.log(err, result)
                })
            });
            tr.end(function() {
                tModel.all({where: {value : 'rollbackendtest'}}, function (err, result) {
                    should.not.exist(err);
                    should.exist(result);
                    result.should.be.instanceOf(Array).and.have.lengthOf(0);
                    
                    adapter.pool.should.be.lengthOf(5);
                    
                    done();
                });
            });
        });
    });
});
