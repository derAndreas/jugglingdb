var assert = require('assert');
var should = require('should');

var Schema = require('../index').Schema;
var Text = Schema.Text;

var credentials = {
    database: 'jugglingdb',
    username: 'jugglingdb',
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

        before(function() {
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
            before(function() {
                UserModel.create(userData, function(err, obj) {
                    should.not.exist(err);
                    should.exist(obj);

                    newNameValue = 'new Name';

                    User = obj;
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


    describe('create hasAndBelongsToMany associations with models', function() {
        var UserModel, PostModel, UserPostJoin,
            User, Post1, Post2;

        before(function() {
            UserModel = schema.define('User', {
                name:       {type: String, index: true}
            });


            PostModel = schema.define('Post', {
                title:      String
            });

            UserPostJoin = schema.define('UserPost');

            UserModel.hasAndBelongsToMany(PostModel, {as: 'posts', through: UserPostJoin, inverse: {as: 'users'}});
        });

        describe('Migrate...', function() {
            it('should migrate the new model', function(done) {
                schema.automigrate(function(err) {
                    should.not.exist(err);
                    done()
                });
            });

            it('should create user and post instances', function(done) {
                UserModel.create({name: 'User1'}, function(err, obj) {
                    User = obj;
                    PostModel.create({title: 'MyTitle1'}, function(err, obj) {
                        Post1 = obj;
                        testDone();
                    });

                    PostModel.create({title: 'MyTitle2'}, function(err, obj) {
                        Post2 = obj;
                        testDone();
                    });
                });

                var waitFor = 2;
                function testDone() {
                    if(--waitFor === 0) {
                        done();
                    }
                }
            });
        });

        describe('create the associations between user and 2 posts', function() {
            it('should validate that user object has `posts` accessor', function(done) {
                User.should.have.property('posts');
                done();
            });
            it('should validate that user.posts accessor has `add` function', function(done) {
                User.posts.should.have.property('add');
                done();
            });
            it('should be possible to add one related persisted post object through user object', function(done) {
                User.posts.add(Post1, function(err) {
                    should.not.exist(err);
                    User.__cachedRelations__.Posts.should.be.lengthOf(1)
                    User.__cachedRelations__.Posts[0].should.equal(Post1)
                    done()
                });
            });

            it('should be possible to add multiple related persisted post object through user object', function(done) {
                User.__cachedRelations__.Posts = []; // reset for this test

                User.posts.add([Post1, Post2], function(err) {
                    should.not.exist(err);
                    User.__cachedRelations__.Posts.should.be.lengthOf(2)
                    User.__cachedRelations__.Posts[0].should.equal(Post1)
                    User.__cachedRelations__.Posts[1].should.equal(Post2)
                    done()
                });
            });

            it('should be possible to add non persisted post object through user object', function(done) {
                var NotPersistPost = new PostModel({title: 'not persisted'});
                User.__cachedRelations__.Posts = []; // reset for this test

                User.posts.add(NotPersistPost, function(err) {
                    should.not.exist(err);
                    User.__cachedRelations__.Posts.should.be.lengthOf(1)
                    User.__cachedRelations__.Posts[0].should.equal(NotPersistPost);
                    done()
                });
            });
        });

        describe('Should save user with associated persisted models', function() {
            it('should add persisted post models', function(done) {
                User.__cachedRelations__.Posts = []; // reset for this test
                User.posts.add([Post1, Post2], function(err) {
                    User.__cachedRelations__.Posts.should.be.lengthOf(2)
                    done()
                });
            });
            it('should save the user', function(done) {
                User.save(function() {
                    User.posts.save(function(err, result) {
                        should.not.exist(err);
                        should.exist(result);

                        result.should.be.lengthOf(2);
                        result[0].id.should.eql(1);
                        result[1].id.should.eql(2);

                        done()
                    });
                })
            });
        });

        describe('query the relation', function() {
            it('should return the realated post objects from user model view', function(done) {
                User.should.have.property('posts');

                User.posts(function(err, result) {
                    should.not.exist(err);
                    should.exist(result);

                    result.should.be.lengthOf(2);
                    result[0].id.should.eql(1);
                    result[1].id.should.eql(2);


                    done()
                });
            });

            it('should return the related users objects from the post model view', function(done) {
                var waitFor = 2;
                // in prev. tests we have 1 user that has 2 posts through join table
                // test foreach post if it returns this user
                
                PostModel.find(1, function(err, Posting) {
                    should.not.exist(err);
                    should.exist(Posting);

                    Posting.users(function(err, result) {
                        should.not.exist(err);
                        should.exist(result);

                        result.should.be.lengthOf(1);
                        result[0].id.should.eql(1);

                        waitForDone()
                    })
                });
                
                PostModel.find(2, function(err, Posting) {
                    should.not.exist(err);
                    should.exist(Posting);

                    Posting.users(function(err, result) {
                        should.not.exist(err);
                        should.exist(result);
                        
                        result.should.be.lengthOf(1);
                        result[0].id.should.eql(1);

                        waitForDone()
                    })
                });
                
                function waitForDone() {
                    if(--waitFor === 0) {
                        done();
                    }
                }
            });
        });
    });
});

