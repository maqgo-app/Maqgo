import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST || [])

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event?.data?.json?.() || {}
  } catch {
    try {
      payload = { body: event?.data?.text?.() || '' }
    } catch {
      payload = {}
    }
  }

  const title = String(payload.title || 'MAQGO')
  const body = String(payload.body || 'Tienes una actualización en tu servicio.')
  const url = String(payload.url || '/')
  const tag = String(payload.tag || 'maqgo')

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      data: { url },
      renotify: true,
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification?.close?.()
  const url = event.notification?.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        try {
          if (client?.url && 'focus' in client) {
            client.focus()
            client.navigate(url)
            return
          }
        } catch {
          continue
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})

