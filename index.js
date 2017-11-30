'use strict'

const Datastore = require('nedb-promise')
const express = require('express')
const bodyParser = require('body-parser')
const bcrypt = require('bcrypt-nodejs')
const socketio = require('socket.io')
const http = require('http')

const bcryptGenSalt = (rounds = 10) => new Promise((resolve, reject) => {
  bcrypt.genSalt(rounds, (err, salt) => {
    if (err) {
      reject(err)
    } else {
      resolve(salt)
    }
  })
})

const bcryptHash = (str, salt) => new Promise((resolve, reject) => {
  bcrypt.hash(str, salt, null, (err, hash) => {
    if (err) {
      reject(err)
    } else {
      resolve(hash)
    }
  })
})

const bcryptCompare = (data, encrypted) => new Promise((resolve, reject) => {
  bcrypt.compare(data, encrypted, (err, result) => {
    if (err) {
      reject(err)
    } else {
      resolve(result)
    }
  })
})

const app = express()
const httpServer = http.Server(app)
const io = socketio(httpServer)

async function main() {
  const db = {
    messages: new Datastore({filename: 'db/messages'}),
    users: new Datastore({filename: 'db/users'})
  }

  await Promise.all(Object.values(db).map(d => d.loadDatabase()))

  app.use(express.static('site'))
  app.use(bodyParser.json())

  app.get('/', (req, res) => {
    res.sendFile(__dirname + '/site/index.html')
  })

  app.post('/api/send-message', async (request, response) => {
    const { text, signature, userID } = request.body

    if (!text || !userID) {
      return
    }

    const message = await db.messages.insert({
      text: request.body.text,
      signature: request.body.signature,
      author: request.body.userID,
      date: Date.now()
    })

    io.emit('received chat message', {message})

    response.end('sent')
  })


  app.post('/api/release-public-key', async (request, response) => {
    const { key, userID } = request.body

    if (!key || !userID) {
      return
    }

    io.emit('released public key', {key, userID})
  })

  app.post('/api/register', async (request, response) => {
    const { username } = request.body
    let { password } = request.body

    if (!username || !password) {
      return
    }

    const salt = await bcryptGenSalt()
    const passwordHash = await bcryptHash(password, salt)
    password = ''

    const user = await db.users.insert({
      username,
      passwordHash,
      salt
    })

    response.end(JSON.stringify({
      id: user._id, username
    }))
  })

  app.post('/api/login', async (request, response) => {
    const { username } = request.body
    let { password } = request.body

    const user = await db.users.findOne({username})

    if (!user) {
      response.end(JSON.stringify({
        error: 'user not found'
      }))
      return
    }

    const { salt, passwordHash } = user

    if (await bcryptCompare(password, passwordHash)) {
      response.end(JSON.stringify({
        nice: 123
      }))
    } else {
      response.end(JSON.stringify({
        error: 'incorrect password'
      }))
    }
  })

  io.on('connection', socket => {
    console.log('a user connected')

    socket.on('disconnect', () => {
      console.log('a user disconnected')
    })
  })

  httpServer.listen(3000, () => {
    console.log('listening on port 3000')
  })
}

main()
  .catch(err => console.error(err.stack))
