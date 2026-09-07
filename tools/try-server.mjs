/**
 * Play a game through the real server, from two "iPads" at once.
 *
 * Plan phase 6. Start the server with `npm run server`, then run this with
 * `node tools/try-server.mjs`. It opens a room, sits two people down,
 * starts a game, tries a move from the wrong person, makes the right one,
 * and closes a lid and comes back.
 *
 * The rules themselves are tested in src/server/room.test.ts with no server
 * running at all. This is the other half: proof that the Durable Object,
 * the sockets and the storage carry those rules faithfully.
 */
import { WebSocket } from 'ws'
const BASE = 'http://127.0.0.1:8787'

const opened = await fetch(`${BASE}/new`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mapId: 'australia',
    options: { armyPlacement: 'automatic', setValues: 'rising', fortifyDistance: 'connected', diceDisplay: 'allAtOnce' },
    players: [
      { name: 'Nick', colour: '#c8453b', kind: 'human' },
      { name: 'James', colour: '#2f6fb0', kind: 'human' },
      { name: 'Cautious', colour: '#e3b62c', kind: 'cautious' },
    ],
  }),
})
const { code, trouble } = await opened.json()
console.log('opened room:', code, trouble ?? '')
if (!code) process.exit(1)

function connect(key, label) {
  const socket = new WebSocket(`ws://127.0.0.1:8787/room/${code}?key=${key}`)
  socket.heard = []
  socket.on('message', (data) => {
    const message = JSON.parse(data.toString())
    socket.heard.push(message)
    if (message.kind === 'trouble') console.log(`  ${label} was told: ${message.message}`)
  })
  return new Promise((done) => socket.on('open', () => done(socket)))
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const latest = (s) => [...s.heard].reverse().find((m) => m.kind === 'room')

const nick = await connect('key-nick', 'Nick')
const james = await connect('key-james', 'James')

nick.send(JSON.stringify({ kind: 'sit', name: 'Nick' }))
await wait(300)
console.log('-- Nick tries to start with James not here yet --')
nick.send(JSON.stringify({ kind: 'start' }))
await wait(300)

james.send(JSON.stringify({ kind: 'sit', name: 'James' }))
await wait(400)

console.log('seats:', latest(nick).room.seats.map((s) => `${s.name}(${s.kind}${s.here ? ', here' : ''})`).join(', '))
console.log('map sent to Nick, once:', nick.heard.filter((m) => m.kind === 'room' && m.room.map).length, 'time(s)')
console.log('Nick is', latest(nick).you, '/ James is', latest(james).you)

nick.send(JSON.stringify({ kind: 'start' }))
await wait(700)
const started = latest(james)
console.log('phase:', started.room.phase, '| places:', Object.keys(started.room.state.territories).length)
console.log('map sent AGAIN to James?', started.room.map ? 'yes (wrong)' : 'no (right)')

const whose = started.room.state.turn.playerId
console.log('whose turn:', whose)
const mine = Object.entries(started.room.state.territories).filter(([, t]) => t.ownerId === whose).map(([id]) => id)

console.log('-- James moves on Nick\'s turn --')
james.send(JSON.stringify({ kind: 'act', action: { type: 'placeArmies', territoryId: mine[0], count: 1 } }))
await wait(350)

console.log('-- Nick makes the same move --')
const before = latest(james).room.state.log.length
nick.send(JSON.stringify({ kind: 'act', action: { type: 'placeArmies', territoryId: mine[0], count: 1 } }))
await wait(450)
console.log('newest line:', latest(james).room.state.log.at(-1).text)
console.log('James saw it without asking:', latest(james).room.state.log.length > before)

console.log('-- Nick closes the lid, then comes back --')
nick.close()
await wait(400)
console.log('seat kept, light off:', latest(james).room.seats.map((s) => `${s.name}:${s.here}`).join(' '))
const nickAgain = await connect('key-nick', 'Nick')
nickAgain.send(JSON.stringify({ kind: 'sit', name: 'Nick' }))
await wait(400)
console.log('same seat back:', latest(nickAgain).you, '| here again:', latest(nickAgain).room.seats.map((s) => `${s.name}:${s.here}`).join(' '))

console.log('-- play out Nick and James, then watch the computer on its own --')
async function takeATurn(socket) {
  for (let step = 0; step < 40; step += 1) {
    const room = latest(socket).room
    const turn = room.state.turn
    const seat = latest(socket).you

    if (turn.playerId !== seat) return
    if (room.phase !== 'playing') return

    if (turn.armiesToPlace > 0) {
      const mine = Object.entries(room.state.territories)
        .filter(([, t]) => t.ownerId === seat)
        .map(([id]) => id)
      socket.send(JSON.stringify({ kind: 'act', action: { type: 'placeArmies', territoryId: mine[0], count: turn.armiesToPlace } }))
    } else if (turn.phase === 'attack') {
      socket.send(JSON.stringify({ kind: 'act', action: { type: 'endAttackPhase' } }))
    } else if (turn.phase === 'fortify') {
      socket.send(JSON.stringify({ kind: 'act', action: { type: 'skipFortify' } }))
    } else {
      return
    }
    await wait(200)
  }
}

await takeATurn(nickAgain)
await takeATurn(james)

const beforeComputer = latest(james).room.state.log.length
console.log('whose turn now:', latest(james).room.state.turn.playerId, '(p3 is the computer)')
console.log('waiting, without anybody asking it to move...')
await wait(5000)
const afterComputer = latest(james).room.state
console.log('lines the computer added on its own:', afterComputer.log.length - beforeComputer)
console.log('newest:', afterComputer.log.at(-1).text)

nickAgain.close(); james.close()
await wait(300)
process.exit(0)
