var safeRequire = require('../utils').safeRequire;

/**
 * Module dependencies
 */
var mysql = safeRequire('mysql');
var BaseSQL = require('../sql');

exports.initialize = function initializeSchema(schema, callback) {
    if (!mysql) return;

    var s = schema.settings;
    schema.client = mysql.createClient({
        host: s.host || 'localhost',
        port: s.port || 3306,
        user: s.username,
        password: s.password,
        debug: s.debug
    });

    schema.adapter = new MySQL(schema.client);
    schema.adapter.schema = schema;
    // schema.client.query('SET TIME_ZONE = "+04:00"', callback);
    schema.client.query('USE ' + s.database, function (err) {
        if (err && err.message.match(/^unknown database/i)) {
            var dbName = s.database;
            schema.client.query('CREATE DATABASE ' + dbName, function (error) {
                if (!error) {
                    schema.client.query('USE ' + s.database, callback);
                } else {
                    throw error;
                }
            });
        } else callback();
    });
};

/**
 * MySQL adapter
 */
function MySQL(client) {
    this._models = {};
    this.client = client;
}

require('util').inherits(MySQL, BaseSQL);

/**
 * Query the database
 * 
 * @param {String}   sql      The SQL String to execute
 * @param {Array}    params   The params to bind to the SQL Statement, if 
 *                            SQL has placeholders with '?', optional
 * @param {Function} callback The callback to execute after query returns, will 
 *                            receive `err` and `data` parameters from mysql driver
 */
MySQL.prototype.query = function (sql, params, callback) {
    if (!this.schema.connected) {
        return this.schema.on('connected', function () {
            this.query(sql, params, callback);
        }.bind(this));
    }
    var client = this.client;
    var time = Date.now();
    var log = this.log;
    
    if(typeof params === 'function') {
        callback = params;
        params = [];
    }
    if (typeof callback !== 'function') throw new Error('callback should be a function');
    this.client.query(sql, params, function (err, data) {
        if (err && err.message.match(/^unknown database/i)) {
            var dbName = err.message.match(/^unknown database '(.*?)'/i)[1];
            client.query('CREATE DATABASE ' + dbName, function (error) {
                if (!error) {
                    client.query(sql, params, callback);
                } else {
                    callback(err);
                }
            });
            return;
        }
        if (log) log(sql, time);
        callback(err, data);
    });
};

/**
 * Create a new row in the table
 * 
 * @param {Object}   model    The schema model
 * @param {Object}   data     The data to insert
 * @param {Function} callback The callback to execute after query returns, will 
 *                            receive `err` from mysql driver and inserted `id` as parameters
 * @todo toFields is not ready for prepared statements
 */
MySQL.prototype.create = function (model, data, callback) {
    if (typeof callback !== 'function') {
        throw new Error('callback should be a function');
    }
    
    var fields = this.toFields(model, data);
    var sql = 'INSERT INTO ' + this.tableEscaped(model);
    if (fields) {
        sql += ' SET ' + fields.sql;
    } else {
        sql += ' VALUES ()';
    }
    this.query(sql, fields.params, function (err, info) {
        callback(err, info && info.insertId);
    });
};

/**
 * Update or create a row in the database table
 * 
 * 
 * @param {Object}   model    The schema model
 * @param {Object}   data     The data to insert
 * @param {Function} callback The callback to execute after query returns, will 
 *                            receive `err` from mysql driver and inserted `id` as parameters
 * @todo fix docs
 */
MySQL.prototype.updateOrCreate = function (model, data, callback) {
    var mysql = this;
    var fieldsNames = [];
    var fieldValues = [];
    var combined = [];
    var combinedValues = [];
    var props = this._models[model].properties;
    Object.keys(data).forEach(function (key) {
        if (props[key] || key === 'id') {
            var k = '`' + key + '`';
            var v;
            if (key !== 'id') {
                v = mysql.toDatabase(props[key], data[key], true);
            } else {
                v = data[key];
            }
            fieldsNames.push(k);
            fieldValues.push(v);
            if (key !== 'id') {
                combined.push(k + ' = ?');
                combinedValues.push(v)
            }
        }
    });
    
    var fieldValuesPrepare = new Array(fieldValues.length + 1).join('?, ');
    var sql = 'INSERT INTO ' + this.tableEscaped(model);
    sql += ' (' + fieldsNames.join(', ') + ')';
    sql += ' VALUES (' + fieldValuesPrepare.substr(0, fieldValuesPrepare.length - 2) + ')';
    sql += ' ON DUPLICATE KEY UPDATE ' + combined.join(', ');

this.query(sql, fieldValues.concat(combinedValues), function (err, info) {
        if (!err && info && info.insertId) {
            data.id = info.insertId;
        }
        callback(err, data);
    });
};

/**
 * Transform the model data to SQL Field statement part
 *  > `fieldname` = `value`
 * 
 * @param {Object}   model    The schema model
 * @param {Object}   data     The data to insert
 * @return {String} comma seperated string with field=val statements
 */
MySQL.prototype.toFields = function (model, data) {
    var fields = [];
    var params = [];
    var props = this._models[model].properties;
    Object.keys(data).forEach(function (key) {
        if (props[key]) {
            fields.push('`' + key.replace(/\./g, '`.`') + '` = ?');
            params.push(this.toDatabase(props[key], data[key], true))
        }
    }.bind(this));
    return {
        sql : fields.join(','),
        params : params
    };
};

/**
 * Helper function to transform a Javascript Date Object
 * into a SQL DATETIME String with format 'YYYY-MM-DD HH:II:SS'
 * 
 * @param {Date} val the Date object
 * @return {String} format for DATETIME column 
 */
function dateToMysql(val) {
    return val.getUTCFullYear() + '-' +
        fillZeros(val.getUTCMonth() + 1) + '-' +
        fillZeros(val.getUTCDate()) + ' ' +
        fillZeros(val.getUTCHours()) + ':' +
        fillZeros(val.getUTCMinutes()) + ':' +
        fillZeros(val.getUTCSeconds());

    function fillZeros(v) {
        return v < 10 ? '0' + v : v;
    }
}

/**
 * Transform model data into SQL ready values to work with them
 * 
 * The model data will be transformed by its type or by the
 * model property definition.
 * 
 * NULL values are returned as 'NULL'
 * 
 * If value is an object assume operational usage like between, gte, lte and
 * transform for operator `between`, `inq` and `nin` the value.
 *  - BETWEEN: will return string `val0 AND val1`
 *  - INQ + NIN: will return string or if multiple oper. values a comma seperated string
 *  
 * 
 * If until here the the SQL ready return value could not be detected,
 * try to use the model property definition of this column to detect the correct
 * value representation for the database.
 * 
 * Model Property configured as...
 *  - NUMBER: return the value
 *  - DATE  : return the value as DATETIME string
 *  - BOOL  : return 1 or 0
 *  else return the escaped string (if `noEscape` param is not set)
 * 
 * @param {Object}  prop     the definition of this property from schema.define
 * @param {Mixed}   val      the value to find the correct database representation
 * @param {Boolean} noEscape flag to indicate, that the returning value should not be escaped. 
 *                           will be removed, needed for compability while changing to prepared statements
 * @todo not completly ready for prepared statement usage
 * @todo remove noEscape parameter, after this function is ready for prepStmts
 * @return {String/Number}
 */
MySQL.prototype.toDatabase = function (prop, val, noEscape) {
    if (val === null) return 'NULL';
    if (val.constructor.name === 'Object') {
        var operator = Object.keys(val)[0]
        val = val[operator];
        if (operator === 'between') {
            return  this.toDatabase(prop, val[0]) +
                    ' AND ' +
                    this.toDatabase(prop, val[1]);
        } else if (operator == 'inq' || operator == 'nin') {
            if (!(val.propertyIsEnumerable('length')) && typeof val === 'object' && typeof val.length === 'number') { //if value is array
                return val.join(',');
            } else {
                return val;
            }
        }
    }
    if (prop.type.name === 'Number') return val;
    if (prop.type.name === 'Date') {
        if (!val) return 'NULL';
        if (!val.toUTCString) {
            val = new Date(val);
        }
        return noEscape === true ? dateToMysql(val) : '"' + dateToMysql(val) + '"';
    }
    if (prop.type.name == "Boolean") return val ? 1 : 0;
    return noEscape === true ? val.toString() : this.client.escape(val.toString());
};

/**
 * Transform the data from the database into JS objects if needed
 * 
 * Because nearly all datatypes between database and JS are compatible,
 * only transform the DATETIME value into Date Objects
 * 
 * @param {Object} model the model
 * @param {Object} data  the data to transform
 * @return {Object} the data
 */
MySQL.prototype.fromDatabase = function (model, data) {
    if (!data) return null;
    var props = this._models[model].properties;
    Object.keys(data).forEach(function (key) {
        var val = data[key];
        if (props[key]) {
            if (props[key].type.name === 'Date' && val !== null) {
                val = new Date(val.toString().replace(/GMT.*$/, 'GMT'));
            }
        }
        data[key] = val;
    });
    return data;
};

/**
 * Escape column names
 * This will escape direct column names or with prefixed table name 
 * > columnname ==> `columnname`
 * > tablename.columnname ==> `tablename`.`columnname`
 * 
 * @param {String} the column- or table-.columnname to escape
 * @return {String}
 */
MySQL.prototype.escapeName = function (name) {
    return '`' + name.replace(/\./g, '`.`') + '`';
};

/**
 * Query the database for all records
 * 
 * Will return all columns from a table or filter the result with
 *  - WHERE: Where conditions are always AND linked
 *          Usage:  Model.all({
 *              where: {
 *                  column1 : value1,
 *                  column2 : value2,
 *                  column3 : {
 *                      gt : value3
 *                  }
 *              }
 *          });
 *  - ORDER: Order by one or multiple columns
 *      Usage: Order by one column
 *          Model.all({
 *              order: 'column1 ASC'
 *          });
 *      Usage: Order by multiple columns
 *          Model.all({
 *              order: [
 *                  'column1 ASC',
 *                  'column2 DESC'
 *              ]
 *          });
 *  - LIMIT: Limit the results
 *      Usage: limit result by 10 rows
 *          Model.all({
 *              limit: 10
 *          });
 *
 *  - LIMIT/OFFSET: OFFSET can only be used only in conjunction with limit
 *                  and will skip the `x` first results
 *      Usage: Show 10, skip the first 2 results
 *          Model.all({
 *              limit: 10, 2
 *          });
 *      Usage: If only the OFFSET is needed, try a big number as limit to not cut off the result
 *          Model.all({
 *              limit: Math.pow(2, 63), 2
 *          });
 *          NOTE: (tested with Node 0.6.15 on linux mint 12
 *              SQL DB support up to 2^64 => 18446744073709551615 (unsigned, bigint)
 *              NodeJS calcs 2^64 to 18446744073709552000, which breaks SQL max value
 *              Tested only 2^63 as valid, but you should not have so many rows in
 *              one table and try to query with limit/offset on this table ;)
 * 
 * @param {Object} model      the model
 * @param {Object} filter     the filters to apply
 * @param {Function} callback The callback to execute after query returns, will 
 *                            receive `err` from mysql driver and an array of `results`
 * @todo refactor remove join filter from other branch which was accidently merged
 * @todo refacor  refactor/rewrite to remove the escaping option and try a smater solution 
 *                for collecting `params` for prepared statements
 */
MySQL.prototype.all = function all(model, filter, callback) {

    var sql = 'SELECT * FROM ' + this.tableEscaped(model);
    var self = this;
    var props = this._models[model].properties;
    var params = [];

    if (filter) {

        if (filter.join) {
            sql = 'SELECT ' + this.tableEscaped(model) + '.* FROM ' + this.tableEscaped(model);
            sql += ' ' + buildJoin(this.table(model), filter.join);
            if (filter.where) {
                var k = Object.keys(filter.where)[0],
                f = this.escapeName(filter.join.modelName + '.' + k) + ' = ' + filter.where[k];
                sql += ' WHERE ' + f;
            }
        } else if (filter.where) {
            var where = buildWhere(filter.where);
            sql += ' ' + where.sql;
            params = params.concat(where.params)
        }

        if (filter.order) {
            sql += ' ' + buildOrderBy(filter.order);
        }

        if (filter.limit) {
            sql += ' ' + buildLimit(filter.limit, filter.offset || 0);
        }

    }
    this.query(sql, params, function (err, data) {
        if (err) {
            return callback(err, []);
        }
        callback(null, data.map(function (obj) {
            return self.fromDatabase(model, obj);
        }));
    }.bind(this));

    return sql;

    function buildJoin(thisClass, relationClass) {
        var rel = relationClass.modelName,
        qry = relationClass.foreignKey,
        f1 = rel + '.' + qry, // should use railway.utils.camelize
        f2 = thisClass + '.id';
        return 'INNER JOIN ' + self.tableEscaped(rel) + ' ON ' + self.escapeName(f1) + ' = ' + self.escapeName(f2);
    }

    function buildWhere(conds) {
        var cs = [];
        var params = [];
        
        Object.keys(conds).forEach(function (key) {
            var keyEscaped = '`' + key.replace(/\./g, '`.`') + '`'
            var val = self.toDatabase(props[key], conds[key], true);
            if (conds[key] === null) {
                cs.push(keyEscaped + ' IS NULL');
            } else if (conds[key].constructor.name === 'Object') {
                var condType = Object.keys(conds[key])[0];
                var sqlCond = keyEscaped;
                switch (condType) {
                    case 'gt':
                        sqlCond += ' > ';
                        break;
                    case 'gte':
                        sqlCond += ' >= ';
                        break;
                    case 'lt':
                        sqlCond += ' < ';
                        break;
                    case 'lte':
                        sqlCond += ' <= ';
                        break;
                    case 'between':
                        sqlCond += ' BETWEEN ';
                        break;
                    case 'inq':
                        sqlCond += ' IN ';
                        break;
                    case 'nin':
                        sqlCond += ' NOT IN ';
                        break;
                    case 'neq':
                        sqlCond + ' != ';
                        break;
                }
                sqlCond += (condType == 'inq' || condType == 'nin') ? '(?)' : '?';
                cs.push(sqlCond);
                params.push(val);
            } else {
                cs.push(keyEscaped + ' = ?');
                params.push(val);
            }
        });
        if (cs.length === 0) {
          return '';
        }
        return {
            sql : 'WHERE ' + cs.join(' AND '),
            params : params
        };
    }

    function buildOrderBy(order) {
        if (typeof order === 'string') order = [order];
        return 'ORDER BY ' + order.join(', ');
    }

    function buildLimit(limit, offset) {
        return 'LIMIT ' + (offset ? (offset + ', ' + limit) : limit);
    }
};



/**
 * Update an existing record in the database
 * 
 * Use this method to call .save() on a Model instance from an
 * early SELECT and update the values of this record in the database
 * 
 * @param {Object}   model    The schema model
 * @param {Object}   data     The data to update, must inlcude `id` attribute
 * @param {Function} callback The callback to execute after query returns, will 
 *                            receive `err` from mysql driver
 */
MySQL.prototype.save = function (model, data, callback) {
    var fields = this.toFields(model, data);
    var sql = 'UPDATE ' + this.tableEscaped(model) + ' SET ' + fields.sql + ' WHERE ' + this.escapeName('id') + ' = ?';
    
    fields.params.push(data.id);
    
    this.query(sql, fields.params, function (err) {
        callback(err);
    });
};

/**
 * Check if a row with the specified ID exists in the database
 * 
 * @param {Object}   model    The schema model
 * @param {Object}   data     The data to update, must inlcude `id` attribute
 * @param {Function} callback The callback to execute after query returns, will 
 *                            receive `err` from mysql driver and bool `exists` as parameter
 */
MySQL.prototype.exists = function (model, id, callback) {
    var sql = 'SELECT 1 FROM ' +
        this.tableEscaped(model) + ' WHERE ' + this.escapeName('id') + ' = ? LIMIT 1';

    this.query(sql, [id], function (err, data) {
        if (err) return callback(err);
        callback(null, data.length === 1);
    });
};

/**
 * Find a record by the ID and return this row
 * 
 * @param {Object}   model    The schema model
 * @param {Object}   id       The id to find
 * @param {Function} callback The callback to execute after query returns, will 
 *                            receive `err` from mysql driver and the `record` as parameter
 */
MySQL.prototype.find = function find(model, id, callback) {
    var sql = 'SELECT * FROM ' +
        this.tableEscaped(model) + ' WHERE ' + this.escapeName('id') + ' = ? LIMIT 1';

    this.query(sql, [id], function (err, data) {
        if (data && data.length === 1) {
            data[0].id = id;
        } else {
            data = [null];
        }
        callback(err, this.fromDatabase(model, data[0]));
    }.bind(this));
};

/**
 * Delete a row in the database by the ID
 * 
 * @param {Object}   model    The schema model
 * @param {Object}   id       The id of the row to delete
 * @param {Function} callback The callback to execute after query returns, will 
 *                            receive `err` from mysql driver
 */
MySQL.prototype.destroy = function destroy(model, id, callback) {
    var sql = 'DELETE FROM ' +
        this.tableEscaped(model) + ' WHERE ' + this.escapeName('id') + ' = ?';

    this.query(sql, [id], function (err) {
        callback(err);
    });
};

/**
 * Count number of entries in database
 * Specify `where` to count entries with a number of entries
 * 
 *      MODEL.count({
 *          column : 'foo'
 *      }, function() {
 *          // result
 *      })
 * 
 * @param {Object}   model    The schema model
 * @param {Function} callback The callback to execute after query returns, will 
 *                            receive `err` from mysql driver and `result` as integer
 * @param {Object}   where    Object literal with where conditions
 * @todo change `count(*)` to `count(id)` for performence
 * @todo `where` does not support operators like lte, gte..
 */
MySQL.prototype.count = function count(model, callback, where) {
    var self = this;
    var props = this._models[model].properties;
    var conds = where ? buildWhere(where) : {sql: '', params : []};
    var sql   = 'SELECT count(*) AS cnt FROM ' + this.tableEscaped(model) + ' ' + conds.sql;
    
    this.query(sql, conds.params, function(err, res) {
        if(err) {
            return callback(err);
        }
        callback(err, res && res[0] && res[0].cnt);
    });

    function buildWhere(conds) {
        var cs = [];
        var params = [];
        
        Object.keys(conds || {}).forEach(function (key) {
            var keyEscaped = self.escapeName(key);
            if (conds[key] === null) {
                cs.push(keyEscaped + ' IS NULL');
            } else {
                cs.push(keyEscaped + ' = ?');
                params.push(self.toDatabase(props[key], conds[key], true))
            }
        });
        
        return {
            sql: cs.length ? ' WHERE ' + cs.join(' AND ') : '',
            params: params
        }
    }
};

/**
 * Update the schema in the database for all schema models
 * 
 * The autoupdate will look for existing tables and update those tables
 * or create them new if they do not exist.
 * Could be used for changes in production systems to not flush the hole
 * data and reimport them.
 * 
 * @see this.alterTable()
 * @see this.createTable()
 * @param {Function} cb callback that is called after everything is done, no paramters
 */
MySQL.prototype.autoupdate = function (cb) {
    var self = this;
    var wait = 0;
    Object.keys(this._models).forEach(function (model) {
        wait += 1;
        self.query('SHOW FIELDS FROM ' + self.tableEscaped(model), function (err, fields) {
            if (!err && fields.length) {
                self.alterTable(model, fields, done);
            } else {
                self.createTable(model, done);
            }
        });
    });
    
    function done(err) {
        if (err) {
            console.log(err);
        }
        if (--wait === 0 && cb) {
            cb();
        }
    }
};

/**
 * Check if the current database is sync'd with the model definition
 * This will not alter the database!
 * 
 * @param {Function} cb callback after the check is done with parameters    
 *                      `err` from mysql driver and bool `isActual` value
 */
MySQL.prototype.isActual = function (cb) {
    var ok = false;
    var self = this;
    var wait = 0;
    Object.keys(this._models).forEach(function (model) {
        wait += 1;
        self.query('SHOW FIELDS FROM ' + model, function (err, fields) {
            self.alterTable(model, fields, done, true);
        });
    });

    function done(err, needAlter) {
        if (err) {
            console.log(err);
        }
        ok = ok || needAlter;
        if (--wait === 0 && cb) {
            cb(null, !ok);
        }
    }
};

/**
 * Update the database schema to the current schema definition in models
 * 
 * This method will perform
 * 
 *  - ADD COLUMN if new column(s) were added in schema model
 *  - DROP COLUMN if column(s) were removed in schema model
 *  - CHANGE COLUMN if properties of a column were changed in schema model
 * 
 * Also internally used to check if the database schema is actual
 * 
 * @param {Object}   model        The schema models
 * @param {Array}    actualFields An array of the columns in the database
 * @param {Function} done         Internal use, callback after a non altering check is done
 * @param {Boolean}  checkOnly    Flag to indicate that only checking should be performed
 * @todo add feature: INDEX
 */
MySQL.prototype.alterTable = function (model, actualFields, done, checkOnly) {
    var self = this;
    var m = this._models[model];
    var propNames = Object.keys(m.properties).filter(function (name) {
        return !!m.properties[name];
    });
    var sql = [];

    // change/add new fields
    propNames.forEach(function (propName) {
        var found;
        actualFields.forEach(function (f) {
            if (f.Field === propName) {
                found = f;
            }
        });

        if (found) {
            actualize(propName, found);
        } else {
            sql.push('ADD COLUMN `' + propName + '` ' + self.propertySettingsSQL(model, propName));
        }
    });

    // drop columns
    actualFields.forEach(function (f) {
        var notFound = !~propNames.indexOf(f.Field);
        if (f.Field === 'id') return;
        if (notFound || !m.properties[f.Field]) {
            sql.push('DROP COLUMN `' + f.Field + '`');
        }
    });

    if (sql.length) {
        if (checkOnly) {
            done(null, true);
        } else {
            this.query('ALTER TABLE `' + model + '` ' + sql.join(',\n'), done);
        }
    } else {
        done();
    }

    function actualize(propName, oldSettings) {
        var newSettings = m.properties[propName];
        if (newSettings && changed(newSettings, oldSettings)) {
            sql.push('CHANGE COLUMN `' + propName + '` `' + propName + '` ' + self.propertySettingsSQL(model, propName));
        }
    }

    function changed(newSettings, oldSettings) {
        if (oldSettings.Null === 'YES' && (newSettings.allowNull === false || newSettings.null === false)) return true;
        if (oldSettings.Null === 'NO' && !(newSettings.allowNull === false || newSettings.null === false)) return true;
        if (oldSettings.Type.toUpperCase() !== datatype(newSettings)) return true;
        return false;
    }
};

/**
 * Create a string that represent all column 
 * with properties to create a db table.
 * 
 * @param {Object} model the schema model
 * @return {String} a comma seperated string with all columns to create
 * @todo refactor: with this approach it is not possible to create indexes over multiple columns
 *         it would be easier if returning string would just contain the columns with
 *              name, type, (un)signed, auto_increment
 *         and then in the createTable() method add the primary_key, index, uniqe, ...
 *         statements like this example
 *         ```
 *             CREATE TABLE test (
 *                  id         INT NOT NULL,
 *                  last_name  CHAR(30) NOT NULL,
 *                  first_name CHAR(30) NOT NULL,
 *                  PRIMARY KEY (id),
 *                  INDEX name (last_name,first_name)
 *              );
 *         ```
 */
MySQL.prototype.propertiesSQL = function (model) {
    var self = this;
    var sql = ['`id` INT(11) NOT NULL AUTO_INCREMENT UNIQUE PRIMARY KEY'];
    Object.keys(this._models[model].properties).forEach(function (prop) {
        sql.push('`' + prop + '` ' + self.propertySettingsSQL(model, prop));
    });
    return sql.join(',\n  ');

};

/**
 * Used to get the column property settings like NOT NULL/NULL and DEFAULT
 * 
 * @param {Object} model the schema model
 * @param {String} prop  the property to create the SQL settings for
 * @return {String}
 * @todo This version is still not finished. It had some problems with `Date`
 *       default values and added some parts of it. But its not clean and stable.
 *       Should be cleaned up...
 */
MySQL.prototype.propertySettingsSQL = function (model, prop) {
    var p = this._models[model].properties[prop],
        d = p.default,
        defaultValue;

    if(typeof d === 'function') {
        if(d === Date.now) {
            defaultValue = dateToMysql(new Date(d()));
        } else {
            defaultValue = d();
        }
    } else if(d instanceof Date) {
        defaultValue = dateToMysql(d);
    } else {
        defaultValue = d;
    }
     
    return datatype(p) + ' ' +
    (p.allowNull === false || p['null'] === false ? 'NOT NULL' : 'NULL') + ' ' +
    (d ? 'DEFAULT ' + this.client.escape(defaultValue) : '');
};

/**
 * Helper function find the correct database type for a column
 * based on the configured schema model
 * 
 * @param {Object} property configuration from schema model
 * @return {String}
 */
function datatype(p) {
    var dt = '';
    switch (p.type.name) {
        case 'String':
        dt = 'VARCHAR(' + (p.limit || 255) + ')';
        break;
        case 'Text':
        dt = 'TEXT';
        break;
        case 'Number':
        dt = 'INT(' + (p.limit || 11) + ')';
        break;
        case 'Date':
        dt = 'DATETIME';
        break;
        case 'Boolean':
        dt = 'TINYINT(1)';
        break;
    }
    return dt;
}

