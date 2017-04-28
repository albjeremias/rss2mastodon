#! /usr/bin/env node
var FeedParser = require('feedparser')
var request = require('superagent')

var dry = false

function crawler (host, db, url, token, bufferSize, cb) {
  var parser = new FeedParser()
  var buffer = []
  parser.once('error', function (err) {
    console.log(err)
  })
  parser.on('readable', function () {
    var stream = this
    var item
    while (item = stream.read()) {
      lock(item, db, function (err, item) {
        if (err) return

        var status = [item.title]
        if (item.summary) status.push(item.summary)
        status.push(item.link)
        buffer.push(status.join('\n'))
        if (!bufferSize || buffer.length >= bufferSize) {
          post(host, token, {status: buffer.join('\n\n')}, function (err) {
            console.log('posted', err)
          })
          buffer = []
        }
      })
    }
  })
  parser.on('end', function () {
    if (buffer.length > 0) {
      post(host, token, {status: buffer.join('\n\n')}, function (err) {
        console.log('posted', err)
      })
    }
  })
  request(url).pipe(parser)
}

function lock (item, db, cb) {
  if (dry) {
    return cb(null, item)
  }
  db.get(item.guid, function (err) {
    if (err && err.notFound) {
      db.put(item.guid, '1')
      cb(null, item)
    } else {
      cb(new Error('existed'))
    }
  })
}

function post (host, token, msg, cb) {
  if (dry) {
    console.log('posting', msg)
    return cb()
  }
  request
    .post(`${host}/api/v1/statuses?access_token=${token}`)
    .type('form')
    .send({status: msg.status})
    .end(function (err, res) {
      if (err) return cb(err)
    })
}

var argv = require('minimist')(process.argv.slice(2))
var level = require('level')
var db = level('./rss2mastodon.db')

dry = argv.dry

crawler(argv.host, db, argv.url, argv.token, argv.bufferSize, function (err) {
  if (err) throw err
  console.log('done')
})
