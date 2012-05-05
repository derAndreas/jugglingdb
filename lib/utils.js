exports.safeRequire = safeRequire;
exports.TransactionQueue = TransactionQueue;

function safeRequire(module) {
    try {
        return require(module);
    } catch (e) {
        console.log('Run "npm install ' + module + '" command to use jugglingdb using this database engine');
        process.exit(1);
    }
}

/**
 * Transactio queue
 * 
 * @param {Object} client a SQL adapter client that will be exclusivly bound to this queue
 * @param {Object} adapter reference to the schema.adapter 
 */
function TransactionQueue(client, adapter) {
    this.queue = [];
    this.client = client;
    this.adapter = adapter;
    
    this.client.query('START TRANSACTION');
};

/**
 * Add queries to the TransactionQueue
 * The SQL param allows raw SQL Statements and a callback, that is called,
 * when the SQL statement is called against the database.
 * This gives the user the ability to add more queries to the transaction queue
 * 
 * Example
 * 
 * var transaction = schema.adapter.startTransaction();
 * 
 * transaction.query('INSERT INTO foo (column) VALUES ("bar")', function(error, result) {
 * 
 * });
 * 
 */
TransactionQueue.prototype.query = function(sql, callback) {
    this.queue.push({
        sql : sql,
        cb  : callback
    });
    
    return this;
}

TransactionQueue.prototype.execute = function(execCB) {
    var self = this,
        qLen = this.queue.length,
        done = 0,
        i;
    
    if(qLen > 0) {
        // working on queue using a function that is self calling
        // now we should be able to add queries in transtion.query CB function
        // and they directly should be invoked here if the execution isn't done
        // before the transaction.query CB adds new queries
        
        perform(this.queue, this.client);
        
        function perform(queue, client) {
            var el = queue.shift();
            try {
                client.query(el.sql, function(err, result, fields) {
                    if(err) {
                        // todo add config options for "rollback on error"
                    }

                    if(el.cb && typeof el.cb === 'function') {
                        el.cb.apply(self, arguments);
                    }
                    if(queue && queue.length == 0) {
                        execCB();
                    } else {
                        perform(queue, client)
                    }
                });
            } catch(e) {
                throw e;
            }
        }
        
    }
    
    return this;
}

/**
 * End a transaction
 * Pass in 'COMMIT' or 'ROLLBACK' as sql param (which is the db statement)
 * if no sql is passed it will use ROLLBACK as default
 * 
 * @param {String} sql use COMMIT or ROLLBACK to end the Transaction queue
 * @param {Function} cb callback to call after the end statement is performed, receive the args [err, result] from mysql adapter
 */
TransactionQueue.prototype.end = function(sql, cb) {
    
    if(!cb || typeof sql === 'function') {
        cb  = sql;
        sql = 'ROLLBACK';
    }
    
    this.client.query(sql, function() {
        this.adapter.pool.push(this.client);
        this.queue = [];
        
        cb.apply(this, Array.prototype.slice.call(arguments))
    }.bind(this));
}

/**
 * Perform a commit on this transaction queue
 * If the .execute() is not called before and there are
 * items in the queue, the execute() method is called and then
 * the commit is send to the db.
 * 
 * @param {Function} cb callback function to call after commit is done, will receive the args [err, result] from mysql adapter
 * @return void
 */
TransactionQueue.prototype.commit = function(cb) {
    this.rollback = function(cb) {
        cb.call(this, new Error('Cannot ROLLBACK, already performed COMMIT'));
    };
    if(this.queue.length > 0) {
        this.execute(function() {
            this.end('COMMIT', cb);
        }.bind(this));
    } else {
        this.end('COMMIT', cb);
    }
    
}

/**
 * Perform a rollback on this transaction queue
 * 
 * @param {Function} cb callback function to call after rollback is done, will receive the args [err, result] from mysql adapter
 * @return void
 */
TransactionQueue.prototype.rollback = function(cb) {
    this.commit = function(cb) {
        cb.call(this, new Error('Cannot COMMIT, already performed ROLLBACK'));
    };
    this.end('ROLLBACK', cb);
}
