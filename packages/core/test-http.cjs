const https = require('node:https')

const body = JSON.stringify({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: '你好，简单介绍自己' }],
  stream: false,
})

const url = new URL(
  'https://aiverse-row.ludp.lenovo.com/ics-apps/projects/115/dev-test/aiverse/endpoint/v1/chat/completions'
)

const req = https.request(
  {
    hostname: url.hostname,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-PDilWPt_Z_IRzwQbSfhE6g',
      'Content-Length': Buffer.byteLength(body),
    },
  },
  (res) => {
    let d = ''
    res.on('data', (c) => (d += c))
    res.on('end', () => {
      const j = JSON.parse(d)
      console.log('STATUS:', res.statusCode)
      console.log('REPLY:', j.choices?.[0]?.message?.content)
    })
  }
)
req.on('error', (e) => console.error('ERR', e.message, e.code))
req.write(body)
req.end()
