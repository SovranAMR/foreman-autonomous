
const tasks = [
  { id: 1, title: 'Visioner için mock API yaz', status: 'completed' },
  { id: 2, title: 'index.html dosyası oluştur', status: 'in-progress' },
  { id: 3, title: 'Testleri çalıştır', status: 'pending' },
];

export function getTasks() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(tasks);
    }, 500);
  });
}
