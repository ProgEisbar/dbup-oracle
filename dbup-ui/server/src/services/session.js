export function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()))
  })
}

export function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()))
  })
}

export function destroySession(req) {
  return new Promise((resolve, reject) => {
    if (!req.session) return resolve()
    req.session.destroy((err) => (err ? reject(err) : resolve()))
  })
}
