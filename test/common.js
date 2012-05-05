var assert = require('assert');
var should = require('should');

var Schema = require('../index').Schema;
var Text = Schema.Text;

var credentials = {
    database: 'jugglingdb',
    username: 'jugglingdb_dev',
    password: 'jugglingdb',
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

    describe('Model definition', function() {
        var UserModel;
        before(function() {
            UserModel = schema.define('User');
        });

        it('should define a Model', function(done) {

            UserModel.should.be.ok;
            UserModel.should.be.a('function');

            UserModel.should.have.property('find').and.be.a('function');
            UserModel.should.have.property('create').and.be.a('function');


            done();
        });
    });

    describe('Working with Models', function() {
        var UserModel, PostModel;

        var userData = {
            name: 'First User',
            email: 'demo@example.org',
            bio: 'This is a bio text',
            approved: false,
            joinedAt: new Date(),
            age: 12,
            passwd: 'my password'
        };

        var postData = {
            title: 'My Title',
            content: 'my content',
            createdAt: new Date("October 13, 1975 11:13:00"),
            publishedAt: new Date()
        };

        before(function(done) {
            UserModel = schema.define('User', {
                name:       {type: String, index: true},
                email:      {type: String, index: true},
                bio:        Text,
                approved:   Boolean,
                joinedAt:   Date,
                age:        Number,
                passwd:     String
            });


            PostModel = schema.define('Post', {
                title:      String,
                content:    Text,
                createdAt:  Date,
                publishedAt:Date
            });

            schema.automigrate(function(err) {
                should.not.exist(err);
                done()
            });
        });

        describe('Working with model', function() {
            it('should create an empty initialzed Model instance with `new` keyword', function(done) {
                var User = new UserModel;

                User.should.have.property('name').and.eql(null);
                User.should.have.property('email').and.eql(null);
                User.should.have.property('bio').and.eql(null);
                User.should.have.property('approved').and.eql(null);
                User.should.have.property('joinedAt').and.eql(null);
                User.should.have.property('age').and.eql(null);
                User.should.have.property('passwd').and.eql(null);

                User.should.have.property('save').and.be.a('function');
                User.should.have.property('propertyChanged').and.be.a('function');

                // initial instances should have properties in dirty state
                User.propertyChanged('name').should.be.true;


                var Post = new PostModel;
                Post.should.have.property('title').and.eql(null);
                Post.should.have.property('content').and.eql(null);
                Post.should.have.property('createdAt').and.eql(null);
                Post.should.have.property('publishedAt').and.eql(null);

                Post.should.have.property('save').and.be.a('function');

                done();
            });

            it('should create a Model and insert to database', function(done) {
                UserModel.create(userData, function(err, User) {
                    should.not.exist(err);
                    should.exist(User);

                    User.should.have.property('id').and.be.a('number');

                    User.should.have.property('name').and.eql(userData['name']);
                    User.should.have.property('email').and.eql(userData['email']);
                    User.should.have.property('bio').and.eql(userData['bio']);
                    User.should.have.property('approved').and.eql(userData['approved']);
                    User.should.have.property('joinedAt').and.eql(userData['joinedAt']);
                    User.should.have.property('age').and.eql(userData['age']);
                    User.should.have.property('passwd').and.eql(userData['passwd']);

                    User.should.have.property('save').and.be.a('function');
                    User.should.have.property('propertyChanged').and.be.a('function');

                    // initial instances should have properties in dirty state
                    User.propertyChanged('name').should.be.false;

                    PostModel.create(postData, function(err, Post) {
                        should.not.exist(err);
                        should.exist(Post);

                        Post.should.have.property('id').and.be.a('number');

                        Post.should.have.property('title').and.eql(postData['title']);
                        Post.should.have.property('content').and.eql(postData['content']);
                        Post.should.have.property('createdAt').and.eql(postData['createdAt']);
                        Post.should.have.property('publishedAt').and.eql(postData['publishedAt']);

                        done();
                    });
                });
            });
        });

        describe('should save data', function() {
            var User,
                newNameValue;
            before(function(done) {
                UserModel.create(userData, function(err, obj) {
                    should.not.exist(err);
                    should.exist(obj);

                    newNameValue = 'new Name';

                    User = obj;

                    done()
                });
            });

            it('should change the name property', function(done) {
                User.name = newNameValue;

                User.propertyChanged('name').should.be.true;
                User.name.should.eql(newNameValue);

                done()
            });

            it('should save the changed property to database', function(done) {
                User.save(function(err, result) {
                    should.not.exist(err);
                    should.exist(result);

                    result.should.have.property('name').and.eql(newNameValue);

                    done()
                });
            });
        });
    });


    describe('create hasMany associations with models', function() {
        var UserModel, PostModel,
            User1, User2, Post1, Post2, Post3;

        before(function() {
            UserModel = schema.define('User', {
                name:       {type: String, index: true}
            });


            PostModel = schema.define('Post', {
                title:      String
            });

            UserModel.hasMany(PostModel, {as: 'posts', foreignKey: 'userId'})
        });

        describe('Migrate...', function() {
            it('should migrate the new model', function(done) {
                schema.automigrate(function(err) {
                    should.not.exist(err);
                    done()
                });
            });
        });


        describe('verify the accessors between models', function() {
            it('should have posts accessor on user instance', function(done) {
                UserModel.create({name: 'Name 1'}, function(err, res) {
                    should.not.exist(err);
                    should.exist(res)

                    User1 = res;

                    User1.name.should.eql('Name 1');
                    User1.id.should.be.a('number');

                    User1.should.have.property('posts').and.be.a('function');

                    done()
                });
            });

            it('should build post instance through user model', function(done) {
                User1.posts(function(err, result) {
                    should.not.exist(err);
                    should.exist(result);
                    result.should.eql([]);

                    Post1 = User1.posts.build();
                    Post1.should.have.property('title').and.eql(null);
                    Post1.should.have.property('userId').and.eql(User1.id)

                    Post1.title = 'foo';

                    Post1.save(function(err, result) {
                        should.not.exist(err);
                        should.exist(result);

                        result.title.should.eql('foo');
                        done();
                    });
                });
            });

            it('should create post instances through user model and directly write post to db', function(done) {
                User1.posts.create({title: 'foobar'}, function(err, result) {
                    should.not.exist(err);
                    should.exist(result);

                    result.id.should.eql(2)

                    result.should.have.property('title').and.eql('foobar');
                    result.should.have.property('userId').and.eql(User1.id);

                    done()
                });
            });

            it('should collect all user related posts from database', function(done) {
                User1.posts(function(err, result) {
                    should.not.exist(err);
                    should.exist(result);

                    result.should.have.lengthOf(2)

                    done()
                });
            });
        });
    });
});

