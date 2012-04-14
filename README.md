
This branch is for testing "hasAndBelongsToMany" associations through joining table.
Only works with mysql so far!

## Example setup and data fetching (from testcase)


### Setup schema definitions for a User and Post Table

    UserModel = schema.define('User', {
        name:       {type: String, index: true}
    });


    PostModel = schema.define('Post', {
        title:      String
    });


### Setup Join Table

    UserPostJoin = schema.define('UserPost');

### Create the bidirectional relation

    UserModel.hasAndBelongsToMany(PostModel, {as: 'posts', through: UserPostJoin, inverse: {as: 'users'}});

If `inverse` is ommited, you can only query `User.posts` and not `Post.users`


## Adding data through the association

### Create a User and add Posts

Posts can be persisted Model or non-persisted instances

    UserModel.create({name : 'My User'}, function(err, User) {
        PostModel.create({title: 'My Title'}, function(err, Post) {
            var notPersistedPost = new PostModel({title: 'Another Post'});

            User.posts.add([Post, notPersistedPost], function(err) {
                User.posts.save(function(err, resultPosts, resultRelations) {
                    // resultPosts contains the persisted post instances
                    // resultRelations contains the persisted UserPost JoinTable results
                });

            });

        });
    });



## Query the results

Querying works almost the same as with hasMany relations

    // User Instance 
    User.posts(function(err, allAssociatedPosts) {
        // allAssociatedPosts contains the associated posts
        // it is generating the SQL Query:
        // SELECT `Post`.* FROM `Post` INNER JOIN `UserPost` ON `UserPost`.`Posts_id` = `Post`.`id` WHERE `UserPost`.`Users_id` = 1
    });


Because of the `inverse` param config option, when establishing the relation it is also possible to

    PostModel.find(1, function(err, Post) {
        Post.users(function(err, allAssociatedUsers) {
            // its generating the following SQL query to gather the results
            // SELECT `User`.* FROM `User` INNER JOIN `UserPost` ON `UserPost`.`Users_id` = `User`.`id` WHERE `UserPost`.`Posts_id` = 1
        });
    });


## todo
A LOT!

