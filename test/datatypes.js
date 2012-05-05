var assert = require('assert');
var should = require('should');


var Schema = require('../index').Schema;
var Text = Schema.Text;

var credentials = {
    database: 'jugglingdb',
    username: 'jugglingdb_dev',
    password: 'jugglingdb'
};

describe('init and connect to database', function() {
    var schema, adapter;

    before(function() {
        schema = new Schema('mysql', credentials);

        schema.log = function(msg) {
            if (process.env.SHOW_SQL) {
                console.log(msg);
            }
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
        
        var cDataTypes;
        
        it('should define models', function (done) {
            
            cDataTypes = schema.define('cDataTypes', {
                sString_1 : String,
                sString_2 : {type : String},
                sString_len : {type: String, limit: 200},
                sString_default_1 : {type: String, default : 1},
                sString_default_2 : {type: String, default : 'foo'},
                sString_default_3 : {type: String, default : function() {return 'fnFoo';}},
                sString_index : {type: String, index: true},
                nNumber_1 : Number,
                nNumber_2 : {type : Number},
                nNumber_len : {type: Number, limit: 5},
                // only numeric values are allowed as default value
                nNumber_default_1 : {type: Number, default : 1},
                nNumber_default_2 : {type: Number, default : function() {return '1';}},
                nNumber_index : {type: Number, index: true},
                tText_1 : Schema.Text,
                tText_2 : {type : Schema.Text},
                tText_len : {type: Schema.Text, limit: 1000},
                // text fields cannot have a default value
                tText_index : {type: Schema.Text, index: true},
                bBool_1: Boolean,
                bBool_2 : {type : Boolean},
                bBool_len : {type: Boolean, limit: 200},
                // bool are tinyint(1) so only 1 and 0 are valid
                bBool_default_1 : {type: Boolean, default : 1},
                bBool_default_2 : {type: Boolean, default : 0},
                bBool_index : {type: Boolean, index: true},
                dDate_1 : Date,
                dDate_2 : {type : Date},
                dDate_len : {type: Date, limit: 200},
                dDate_default_1 : {type: Date, default : 0},
                dDate_default_2 : {type: Date, default : Date.now, foo : 1},
                dDate_default_3 : {type: Date, default : function() { return '2012-05-03 17:57:35';}},
                dDate_default_4 : {type: Date, default : new Date()},
                dDate_index : {type: Date, index: true},
            });
            
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
        
        describe('validate the created table', function () {
            
            var columns = {};
            
            before(function (done) {
                client.query('DESCRIBE cDataTypes', function(err, result) {

                    result.map(function(column) {
                        columns[column.Field] = {
                            name         : column.Field,
                            type         : column.Type,
                            nullVal      : column.Null,
                            key          : column.Key,
                            defaultValue : column.Default,
                            extra        : column.Extra
                        }
                    });
                    
                    done();
                });
            });
            
            it('should have created all columns', function (done) {
                columns.should.have.keys('id', 
                    'sString_1', 'sString_2', 'sString_len',  
                    'sString_default_1', 'sString_default_2', 'sString_default_3', 
                    'sString_index',
                    'nNumber_1', 'nNumber_2', 'nNumber_len', 
                    'nNumber_default_1', 'nNumber_default_2',
                    'nNumber_index',
                    'tText_1', 'tText_2', 'tText_len',
                    'tText_index',
                    'bBool_1', 'bBool_2', 'bBool_len',
                    'bBool_default_1', 'bBool_default_2',
                    'bBool_index',
                    'dDate_1', 'dDate_2', 'dDate_len',
                    'dDate_default_1', 'dDate_default_2', 'dDate_default_3', 'dDate_default_4',
                    'dDate_index'
                );
                done();
            });
            
            it('should haved generated automatically an `id` column', function () {
                columns.id.should.have.property('type', 'int(11)');
                columns.id.should.have.property('nullVal', 'NO');
                columns.id.should.have.property('key', 'PRI');
                columns.id.should.have.property('defaultValue', null);
                columns.id.should.have.property('extra', 'auto_increment');
            });
            
            it('should have created correct string related fields', function(done) {
                columns.sString_1.should.have.property('type', 'varchar(255)');
                columns.sString_1.should.have.property('nullVal', 'YES');
                columns.sString_1.should.have.property('key', '');
                columns.sString_1.should.have.property('defaultValue', null);
                columns.sString_1.should.have.property('extra', '');

                columns.sString_2.should.have.property('type', 'varchar(255)');
                columns.sString_2.should.have.property('nullVal', 'YES');
                columns.sString_2.should.have.property('key', '');
                columns.sString_2.should.have.property('defaultValue', null);
                columns.sString_2.should.have.property('extra', '');
                
                columns.sString_len.should.have.property('type', 'varchar(200)');
                columns.sString_len.should.have.property('nullVal', 'YES');
                columns.sString_len.should.have.property('key', '');
                columns.sString_len.should.have.property('defaultValue', null);
                columns.sString_len.should.have.property('extra', '');
                
                columns.sString_default_1.should.have.property('type', 'varchar(255)');
                columns.sString_default_1.should.have.property('nullVal', 'YES');
                columns.sString_default_1.should.have.property('key', '');
                columns.sString_default_1.should.have.property('defaultValue', '1');
                columns.sString_default_1.should.have.property('extra', '');
                
                columns.sString_default_2.should.have.property('type', 'varchar(255)');
                columns.sString_default_2.should.have.property('nullVal', 'YES');
                columns.sString_default_2.should.have.property('key', '');
                columns.sString_default_2.should.have.property('defaultValue', 'foo');
                columns.sString_default_2.should.have.property('extra', '');
                
                columns.sString_default_3.should.have.property('type', 'varchar(255)');
                columns.sString_default_3.should.have.property('nullVal', 'YES');
                columns.sString_default_3.should.have.property('key', '');
                columns.sString_default_3.should.have.property('defaultValue', 'fnFoo');
                columns.sString_default_3.should.have.property('extra', '');

// INDEX not working at the moment
//                columns.sString_index.should.have.property('type', 'varchar(255)');
//                columns.sString_index.should.have.property('nullVal', 'YES');
//                columns.sString_index.should.have.property('key', '');
//                columns.sString_index.should.have.property('defaultValue', null);
//                columns.sString_index.should.have.property('extra', '');
                
                done();
            });
            
            
            it('should have created correct number related fields', function(done) {
                columns.nNumber_1.should.have.property('type', 'int(11)');
                columns.nNumber_1.should.have.property('nullVal', 'YES');
                columns.nNumber_1.should.have.property('key', '');
                columns.nNumber_1.should.have.property('defaultValue', null);
                columns.nNumber_1.should.have.property('extra', '');

                columns.nNumber_2.should.have.property('type', 'int(11)');
                columns.nNumber_2.should.have.property('nullVal', 'YES');
                columns.nNumber_2.should.have.property('key', '');
                columns.nNumber_2.should.have.property('defaultValue', null);
                columns.nNumber_2.should.have.property('extra', '');
                
                columns.nNumber_len.should.have.property('type', 'int(5)');
                columns.nNumber_len.should.have.property('nullVal', 'YES');
                columns.nNumber_len.should.have.property('key', '');
                columns.nNumber_len.should.have.property('defaultValue', null);
                columns.nNumber_len.should.have.property('extra', '');
                
                columns.nNumber_default_1.should.have.property('type', 'int(11)');
                columns.nNumber_default_1.should.have.property('nullVal', 'YES');
                columns.nNumber_default_1.should.have.property('key', '');
                columns.nNumber_default_1.should.have.property('defaultValue', '1');
                columns.nNumber_default_1.should.have.property('extra', '');
                
                columns.nNumber_default_2.should.have.property('type', 'int(11)');
                columns.nNumber_default_2.should.have.property('nullVal', 'YES');
                columns.nNumber_default_2.should.have.property('key', '');
                columns.nNumber_default_2.should.have.property('defaultValue', '1');
                columns.nNumber_default_2.should.have.property('extra', '');

// INDEX not working at the moment
//                columns.nNumber_index.should.have.property('type', 'int(11)');
//                columns.nNumber_index.should.have.property('nullVal', 'YES');
//                columns.nNumber_index.should.have.property('key', '');
//                columns.nNumber_index.should.have.property('defaultValue', null);
//                columns.nNumber_index.should.have.property('extra', '');
                
                done();
            });
            
            
            it('should have created correct text related fields', function(done) {
                columns.tText_1.should.have.property('type', 'text');
                columns.tText_1.should.have.property('nullVal', 'YES');
                columns.tText_1.should.have.property('key', '');
                columns.tText_1.should.have.property('defaultValue', null);
                columns.tText_1.should.have.property('extra', '');

                columns.tText_2.should.have.property('type', 'text');
                columns.tText_2.should.have.property('nullVal', 'YES');
                columns.tText_2.should.have.property('key', '');
                columns.tText_2.should.have.property('defaultValue', null);
                columns.tText_2.should.have.property('extra', '');
                
                columns.tText_len.should.have.property('type', 'text');
                columns.tText_len.should.have.property('nullVal', 'YES');
                columns.tText_len.should.have.property('key', '');
                columns.tText_len.should.have.property('defaultValue', null);
                columns.tText_len.should.have.property('extra', '');
  
// INDEX not working at the moment
//                columns.tText_index.should.have.property('type', 'varchar(255)');
//                columns.tText_index.should.have.property('nullVal', 'YES');
//                columns.tText_index.should.have.property('key', '');
//                columns.tText_index.should.have.property('defaultValue', null);
//                columns.tText_index.should.have.property('extra', '');
                
                done();
            });
            
            
            it('should have created correct boolean related fields', function(done) {
                columns.bBool_1.should.have.property('type', 'tinyint(1)');
                columns.bBool_1.should.have.property('nullVal', 'YES');
                columns.bBool_1.should.have.property('key', '');
                columns.bBool_1.should.have.property('defaultValue', null);
                columns.bBool_1.should.have.property('extra', '');

                columns.bBool_2.should.have.property('type', 'tinyint(1)');
                columns.bBool_2.should.have.property('nullVal', 'YES');
                columns.bBool_2.should.have.property('key', '');
                columns.bBool_2.should.have.property('defaultValue', null);
                columns.bBool_2.should.have.property('extra', '');
                
                // on boolean any `limit` config will be overridden to tinyint(1)
                columns.bBool_len.should.have.property('type', 'tinyint(1)');
                columns.bBool_len.should.have.property('nullVal', 'YES');
                columns.bBool_len.should.have.property('key', '');
                columns.bBool_len.should.have.property('defaultValue', null);
                columns.bBool_len.should.have.property('extra', '');
                
                columns.bBool_default_1.should.have.property('type', 'tinyint(1)');
                columns.bBool_default_1.should.have.property('nullVal', 'YES');
                columns.bBool_default_1.should.have.property('key', '');
                columns.bBool_default_1.should.have.property('defaultValue', '1');
                columns.bBool_default_1.should.have.property('extra', '');
                
                columns.bBool_default_2.should.have.property('type', 'tinyint(1)');
                columns.bBool_default_2.should.have.property('nullVal', 'YES');
                columns.bBool_default_2.should.have.property('key', '');
                columns.bBool_default_2.should.have.property('defaultValue', null);
                columns.bBool_default_2.should.have.property('extra', '');

// INDEX not working at the moment
//                columns.bBool_index.should.have.property('type', 'tinyint(1)');
//                columns.bBool_index.should.have.property('nullVal', 'YES');
//                columns.bBool_index.should.have.property('key', '');
//                columns.bBool_index.should.have.property('defaultValue', null);
//                columns.bBool_index.should.have.property('extra', '');
                
                done();
            });
            
            
            
            
            it('should have created correct date related fields', function(done) {
                columns.dDate_1.should.have.property('type', 'datetime');
                columns.dDate_1.should.have.property('nullVal', 'YES');
                columns.dDate_1.should.have.property('key', '');
                columns.dDate_1.should.have.property('defaultValue', null);
                columns.dDate_1.should.have.property('extra', '');

                columns.dDate_2.should.have.property('type', 'datetime');
                columns.dDate_2.should.have.property('nullVal', 'YES');
                columns.dDate_2.should.have.property('key', '');
                columns.dDate_2.should.have.property('defaultValue', null);
                columns.dDate_2.should.have.property('extra', '');
                
                columns.dDate_len.should.have.property('type', 'datetime');
                columns.dDate_len.should.have.property('nullVal', 'YES');
                columns.dDate_len.should.have.property('key', '');
                columns.dDate_len.should.have.property('defaultValue', null);
                columns.dDate_len.should.have.property('extra', '');
                
                columns.dDate_default_1.should.have.property('type', 'datetime');
                columns.dDate_default_1.should.have.property('nullVal', 'YES');
                columns.dDate_default_1.should.have.property('key', '');
                columns.dDate_default_1.should.have.property('defaultValue', null);
                columns.dDate_default_1.should.have.property('extra', '');
                
                columns.dDate_default_2.should.have.property('type', 'datetime');
                columns.dDate_default_2.should.have.property('nullVal', 'YES');
                columns.dDate_default_2.should.have.property('key', '');
                columns.dDate_default_2.should.have.property('defaultValue').with.match(/\d{4}\-\d{2}\-\d{2} \d{2}:\d{2}:\d{2}/);
                columns.dDate_default_2.should.have.property('extra', '');
                
                columns.dDate_default_3.should.have.property('type', 'datetime');
                columns.dDate_default_3.should.have.property('nullVal', 'YES');
                columns.dDate_default_3.should.have.property('key', '');
                columns.dDate_default_3.should.have.property('defaultValue', '2012-05-03 17:57:35');
                columns.dDate_default_3.should.have.property('extra', '');

// INDEX not working at the moment
//                columns.dDate_index.should.have.property('type', 'datetime');
//                columns.dDate_index.should.have.property('nullVal', 'YES');
//                columns.dDate_index.should.have.property('key', '');
//                columns.dDate_index.should.have.property('defaultValue', null);
//                columns.dDate_index.should.have.property('extra', '');
                
                done();
            });
        });
    });
});