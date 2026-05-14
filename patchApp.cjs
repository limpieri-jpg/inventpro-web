const fs = require('fs')

// Aggiorna App.jsx
let app = fs.readFileSync('src/App.jsx', 'utf8')
if (!app.includes("import Documenti")) {
  app = app.replace("import Admin from './pages/Admin'", "import Admin from './pages/Admin'\nimport Documenti from './pages/Documenti'")
  app = app.replace(
    '<Route path="/contratti" element={<ProtectedRoute><Contratti /></ProtectedRoute>} />',
    '<Route path="/contratti" element={<ProtectedRoute><Contratti /></ProtectedRoute>} />\n        <Route path="/documenti" element={<ProtectedRoute><Documenti /></ProtectedRoute>} />'
  )
  fs.writeFileSync('src/App.jsx', app)
  console.log('App.jsx OK - ' + app.length + ' chars')
} else {
  console.log('App.jsx già aggiornato')
}
