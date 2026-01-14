
const CACHE_NAME = 'professor-smart-v15';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&display=swap'
];

const DAYS_MAP = {
  'الأحد': 0,
  'الاثنين': 1,
  'الثلاثاء': 2,
  'الأربعاء': 3,
  'الخميس': 4,
  'الجمعة': 5,
  'السبت': 6
};

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  // استراتيجية الكاش أولاً للملفات الثابتة، والشبكة أولاً للباقي
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      
      return fetch(event.request).then((response) => {
        return response;
      }).catch(() => {
        // العودة لصفحة البداية عند انقطاع الانترنت
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// Notification Logic
let notificationTimer = null;

function checkNotifications(schedules, minutesBefore, role) {
  const now = new Date();
  const currentDay = now.getDay(); // 0-6
  
  schedules.forEach(schedule => {
    const scheduleDay = DAYS_MAP[schedule.day];
    if (scheduleDay === undefined) return;

    // Calculate next occurrence of this day/time
    const [hours, minutes] = schedule.time.split(':').map(Number);
    const targetDate = new Date(now);
    targetDate.setHours(hours, minutes, 0, 0);
    
    // Adjust day if needed
    let dayDiff = scheduleDay - currentDay;
    if (dayDiff < 0 || (dayDiff === 0 && targetDate < now)) {
      dayDiff += 7;
    }
    targetDate.setDate(targetDate.getDate() + dayDiff);

    const timeDiff = targetDate.getTime() - now.getTime();
    const alertTime = minutesBefore * 60 * 1000;

    // If within the window and not already notified (using a simple threshold)
    if (timeDiff > alertTime - 60000 && timeDiff <= alertTime) {
      self.registration.showNotification('تذكير بموعد المحاضرة', {
        body: `تبدأ محاضرة ${schedule.groupName} خلال ${minutesBefore} دقيقة`,
        icon: './logo.png', // Fallback to icon if exists
        badge: './logo.png',
        vibrate: [200, 100, 200],
        data: { url: './' }
      });
    }
  });
}

self.addEventListener('message', (event) => {
  if (event.data.type === 'SCHEDULE_NOTIFICATIONS') {
    if (notificationTimer) clearInterval(notificationTimer);
    
    const { schedules, minutesBefore, role } = event.data;
    
    // Check every minute
    notificationTimer = setInterval(() => {
      checkNotifications(schedules, minutesBefore, role);
    }, 60000);
    
    // Initial check
    checkNotifications(schedules, minutesBefore, role);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === event.notification.data.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url);
      }
    })
  );
});
