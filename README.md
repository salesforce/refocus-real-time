# refocus-real-time

##### Configure to push to heroku:
```
heroku git:remote -a rf-rt-spike
```

##### Commit and push changes to heroku:
```
git commit -am "..."
git push heroku master
```

##### Attach the redis pubsub addons
Attach the redis pubsub addons from the back-end api app
into *this* app, e.g. if the redis addon is named
"redis-vertical-91027" in the back-end api app, and if the
real-time app is "rf-rt-spike" then this command will
attach that redis pubsub instance to this application:

```
heroku addons:attach redis-vertical-91027 -a rf-rt-spike
```

## Config Vars in the Real-Time Application

* `IP_WHITELIST_SERVICE`: the url of the whitelisting app
* `PORT`: the port to run the socket.io server on
* `REDIS_PUBSUB_BOTS`: the name of the environment variable that contains the
   url of the redis instance used for bot pubsub
* `REDIS_PUBSUB_PERSPECTIVES`: a comma-separated list of environment variables that contain the
   urls of the redis instances used for perspective pubsub
* `REFOCUS_API_URL`: the url of the api app
* `REFOCUS_API_TOKEN`: must be a valid token with API access to retrieve list of
   perspectives from the back-end api app
* `SECRET`: must be the same as the one used by the back-end API application
* `TOKEN_AUTH_TIMEOUT`: the time in ms to wait for the client to send a token before disconnecting

### Toggles ("true" to enable, disabled by default)
* `USE_OLD_NAMESPACE_FORMAT`: accept connections from clients using the old namespace format,
   with the filter details in the namespace itself
* `USE_NEW_NAMESPACE_FORMAT`: accept connections from clients using the new namespace format,
   with the filter details in the "id" query param

